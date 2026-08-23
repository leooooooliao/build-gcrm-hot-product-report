import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDeliveryManifest, expectedReadback, reconcileDelivery } from "./delivery_contract.mjs";
import { CREATIVE_DASHBOARD_URL, validateCreativeLinks } from "./creative_contract.mjs";
import { validateMarketContext } from "./market_context_contract.mjs";
import { CORE_SHEET_NAMES, CREATIVE_HEADERS, POOL_HEADERS, RAW_HEADERS, validateSheetDelivery } from "./sheet_contract.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function row(productId, rank, gmv, change, averagePrice, adsCost, options = {}) {
  return {
    rank,
    product_id: productId,
    product_name: options.name || `Product ${productId}`,
    category_l1: "Pet Supplies",
    category_l2: "Dog & Cat Accessories",
    category_l3: "Test",
    gmv_total: `${gmv}\n${change}%`,
    gmv_live: `${options.live || "10K"}\n0%`,
    gmv_video: `${options.video || "60K"}\n0%`,
    gmv_product_card: "5K\n0%",
    order_volume: "1K\n0%",
    avg_price: `${averagePrice}\n0%`,
    ads_cost: `${adsCost}\n0%`,
    refund_rate: "1%\n0%",
    shop_name: `Shop ${productId}`,
    image_url: "https://example.com/image.jpg",
    join_quality: "product_id",
  };
}

function recommendation(productId, archetype, action, insight) {
  return {
    product_id: productId,
    archetype,
    action,
    insight,
    local_context: `${productId} 的美国本地使用场景说明；不强行归因于节日或季节。`,
    local_context_status: "unverified",
    local_context_sources: [],
    execution_advice: `${productId} 先核价、履约与内容适配，再按动作标签执行。`,
  };
}

const gmvRows = [
  row("b1", 1, "526K", -19.7, 114.3, "44K"),
  row("b2", 2, "337K", -8.9, 54.5, "35K"),
  row("g1", 3, "205K", 29.8, 27, "32K"),
  row("g2", 4, "184K", 1155.6, 218.5, "19K"),
  row("g3", 5, "119K", 702.7, 26.6, "56.5K"),
  row("g4", 6, "98K", 256.7, 79, "3.3K"),
  row("g5", 7, "85K", 2906.7, 75.6, "4.5K"),
  row("g6", 8, "74K", 390715.8, 17.1, "20.6K"),
];
const risingRows = [
  row("g1", 1, "7", 0, 27, "1", { name: "Conflicting rising-row copy" }),
  row("noise", 2, "9", 0, 9, "1"),
];
const translations = Object.fromEntries(gmvRows.map((item) => [item.product_id, `中文${item.product_id}`]));
translations.noise = "噪声商品";
const spec = {
  meta: {
    country: "US",
    category: "宠物用品",
    category_level: 1,
    category_l1: "宠物用品",
    category_l2: null,
    category_path: "宠物用品",
    period_start: "2026-07-04",
    period_end: "2026-08-02",
    source_url: "https://mmm.tiktok-row.net/gcrm_overseas/phoenix/marketing-advisor/product-insights/top-product",
    taxonomy_snapshot: "2026-08-02",
  },
  rankings: {
    "GMV Top 50": gmvRows,
    "销量 Top 50": [],
    "广告消耗 Top 50": [],
    "飙升 Top 50": risingRows,
  },
  product_translations: translations,
  summary_bullets: ["结论一", "结论二", "结论三"],
  market_context: {
    schema_version: "1.0.0",
    search_available: true,
    attempted: true,
    attempted_at: "2026-08-02T11:00:00Z",
    queries: ["US pet supplies recall July 2026"],
    status: "completed",
    signals: [
      {
        signal_type: "风险信号",
        title: "宠物用品安全提醒样例",
        date: "2026-08-01",
        source_name: "Example regulator",
        source_url: "https://example.com/pet-safety",
        relevance_to: ["宠物用品", "g1"],
        what_changed: "监管机构发布与该商品原型直接相关的安全提醒。",
        why_it_matters: "会改变推荐品的合规与供应商审核动作。",
        merchant_action: "上架前补充合规文件并复核产品声明。",
        confidence: "high",
        relevance_score: 6,
      },
    ],
    blocked_reason: null,
  },
  recommendations: {
    benchmarks: [
      recommendation("b2", "饮水机", "仅作标杆", "标杆2"),
      recommendation("b1", "猫砂盆", "仅作标杆", "标杆1"),
    ],
    growth: [
      recommendation("g6", "耳部清洁", "小单测试", "增长6"),
      recommendation("g4", "猫砂盆", "快速跟进", "增长4"),
      recommendation("g2", "猫砂盆", "快速跟进", "增长2"),
      recommendation("g5", "猫砂盆", "小单测试", "增长5"),
      recommendation("g1", "除臭器", "条件跟进", "增长1"),
      recommendation("g3", "胸背带", "小单测试", "增长3"),
    ],
  },
};

const manifest = buildDeliveryManifest(spec);
assert.equal(manifest.recommendations.length, 8);
assert.deepEqual(manifest.recommendation_ids, ["b1", "b2", "g1", "g2", "g3", "g4", "g5", "g6"]);
assert.equal(manifest.recommendations[2].source_banner, "GMV Top 50");
assert.equal(manifest.recommendations[2].metrics.gmv_range, "205K");
assert.equal(manifest.recommendations[2].metrics.gmv_change, 0.298);
assert.equal(manifest.recommendations[2].product_name, "Product g1");
assert.equal(manifest.schema_version, "1.1.0");
assert.equal(manifest.recommendations[2].local_context_status, "unverified");

const readback = expectedReadback(manifest);
assert.deepEqual(reconcileDelivery(manifest, readback, readback), {
  valid: true,
  delivery_id: manifest.delivery_id,
  errors: [],
});
const brokenBrief = structuredClone(readback);
brokenBrief.recommendations[2].gmv_range = "7";
const brokenResult = reconcileDelivery(manifest, readback, brokenBrief);
assert.equal(brokenResult.valid, false);
assert.match(brokenResult.errors.join("\n"), /brief: position 3 gmv_range mismatch/);

const wrongCount = structuredClone(spec);
wrongCount.recommendations.growth = wrongCount.recommendations.growth.slice(0, 5);
assert.throws(() => buildDeliveryManifest(wrongCount), /exactly 6 required/);

const zeroGrowth = structuredClone(spec);
zeroGrowth.rankings["GMV Top 50"][2].gmv_total = "205K\n0%";
assert.throws(() => buildDeliveryManifest(zeroGrowth), /real positive value/);

const sheetReadback = {
  delivery_mode: "feishu",
  sheet_url: "https://example.larksuite.com/sheets/test",
  creative_query_performed: true,
  creative_query_status: "completed",
  sheets: [
    { name: "结论", headers: [] },
    { name: "选品池", headers: POOL_HEADERS },
    { name: "Top50原始榜单", headers: RAW_HEADERS },
    { name: "使用说明", headers: [] },
    { name: "素材链接", headers: CREATIVE_HEADERS },
  ],
  expected_raw_rows: 10,
  actual_raw_rows: 10,
  recommendation_rows: 8,
  compound_metric_cells: [],
  document_created: false,
};
assert.equal(validateSheetDelivery(sheetReadback).valid, true);
const missingCoreSheet = structuredClone(sheetReadback);
missingCoreSheet.sheets = missingCoreSheet.sheets.filter((item) => item.name !== CORE_SHEET_NAMES[0]);
assert.match(validateSheetDelivery(missingCoreSheet).errors.join("\n"), /missing core sheet 结论/);
const compoundMetric = structuredClone(sheetReadback);
compoundMetric.compound_metric_cells = ["Top50原始榜单!I5"];
assert.match(validateSheetDelivery(compoundMetric).errors.join("\n"), /expected 0, got 1/);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gcrm-delivery-contract-"));
try {
  const specPath = path.join(tempDir, "report-spec.json");
  const briefPath = path.join(tempDir, "brief.xml");
  const reportPath = path.join(tempDir, "report.xlsx");
  const previewDir = path.join(tempDir, "previews");
  const manifestPath = path.join(tempDir, "delivery-manifest.json");
  const sheetReadbackPath = path.join(tempDir, "sheet-readback.json");
  const briefReadbackPath = path.join(tempDir, "brief-readback.json");
  const sheetDeliveryReadbackPath = path.join(tempDir, "sheet-delivery-readback.json");
  const creativeLinksPath = path.join(tempDir, "creative-links.json");
  const blockedCreativeLinksPath = path.join(tempDir, "creative-links-blocked.json");
  const blockedBriefPath = path.join(tempDir, "brief-blocked.xml");
  const emptyMarketSpecPath = path.join(tempDir, "report-spec-empty-market.json");
  const emptyMarketBriefPath = path.join(tempDir, "brief-empty-market.xml");
  await fs.writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  const creativeLinks = {
    schema_version: "1.2.0",
    query_status: "completed",
    attempted: true,
    attempted_at: "2026-08-02T12:00:00Z",
    routing: {
      capability_checked: true,
      crm_data_query_available: true,
      crm_data_query_attempted: true,
      query_route: "crm-data-query",
      query_prompts: [
        `用crm-data-query取数：${CREATIVE_DASHBOARD_URL} 请设置 Pdate=2026-07-05至2026-08-01，Ecommerce Product ID=${manifest.recommendation_ids.slice(0, 5).join(",")}；返回 Ecommerce Product ID、Dollar Revenue、URL。`,
        `用crm-data-query取数：${CREATIVE_DASHBOARD_URL} 请设置 Pdate=2026-07-05至2026-08-01，Ecommerce Product ID=${manifest.recommendation_ids.slice(5).join(",")}；返回 Ecommerce Product ID、Dollar Revenue、URL。`,
      ],
      fallback_reason: null,
    },
    meta: {
      source_url: CREATIVE_DASHBOARD_URL,
      period_start: "2026-07-05",
      period_end: "2026-08-01",
      filter_field: "Ecommerce Product ID",
      requested_product_ids: manifest.recommendation_ids,
    },
    links: [
      { product_id: "b1", creative_rank: 1, dollar_revenue: 3200, url: "https://www.tiktok.com/example-b1" },
    ],
    counts: Object.fromEntries(manifest.recommendation_ids.map((productId) => [productId, productId === "b1" ? 1 : 0])),
    blocked_reason: null,
  };
  const blockedCreativeLinks = {
    ...structuredClone(creativeLinks),
    query_status: "blocked",
    routing: {
      ...structuredClone(creativeLinks.routing),
      query_route: "crm-data-query+browser",
      fallback_reason: "crm-data-query 重试失败后浏览器看板仍未返回结果",
    },
    links: [],
    counts: Object.fromEntries(manifest.recommendation_ids.map((productId) => [productId, 0])),
    blocked_reason: "看板在一次安全重试后仍未返回结果",
  };
  const emptyCreativeLinks = {
    ...structuredClone(creativeLinks),
    query_status: "empty",
    links: [],
    counts: Object.fromEntries(manifest.recommendation_ids.map((productId) => [productId, 0])),
  };
  assert.equal(validateCreativeLinks(creativeLinks, manifest.recommendation_ids).valid, true);
  assert.equal(validateCreativeLinks(blockedCreativeLinks, manifest.recommendation_ids).valid, true);
  assert.equal(validateCreativeLinks(emptyCreativeLinks, manifest.recommendation_ids).valid, true);
  assert.equal(validateMarketContext(spec.market_context).valid, true);
  const browserCreativeLinks = structuredClone(creativeLinks);
  browserCreativeLinks.routing = {
    capability_checked: true,
    crm_data_query_available: false,
    crm_data_query_attempted: false,
    query_route: "browser",
    query_prompts: [],
    fallback_reason: null,
  };
  assert.equal(validateCreativeLinks(browserCreativeLinks, manifest.recommendation_ids).valid, true);
  const skippedCreativeLinks = { ...structuredClone(blockedCreativeLinks), attempted: false };
  assert.match(validateCreativeLinks(skippedCreativeLinks, manifest.recommendation_ids).errors.join("\n"), /skipped creative query/);
  const shopNameCreativeLinks = structuredClone(creativeLinks);
  shopNameCreativeLinks.meta.filter_field = "Shop Name";
  assert.match(validateCreativeLinks(shopNameCreativeLinks, manifest.recommendation_ids).errors.join("\n"), /not Shop Name/);
  const skippedPreferredRoute = structuredClone(creativeLinks);
  skippedPreferredRoute.routing.crm_data_query_attempted = false;
  skippedPreferredRoute.routing.query_route = "browser";
  skippedPreferredRoute.routing.query_prompts = [];
  assert.match(validateCreativeLinks(skippedPreferredRoute, manifest.recommendation_ids).errors.join("\n"), /must be true when crm-data-query is available/);
  await fs.writeFile(creativeLinksPath, `${JSON.stringify(creativeLinks, null, 2)}\n`, "utf8");
  await fs.writeFile(blockedCreativeLinksPath, `${JSON.stringify(blockedCreativeLinks, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_feishu_brief.mjs"),
    "--input", specPath,
    "--output", briefPath,
    "--sheet-url", "https://example.larksuite.com/sheets/test",
    "--creative-links", creativeLinksPath,
  ]);
  const briefXml = await fs.readFile(briefPath, "utf8");
  assert.match(briefXml, new RegExp(`交付校验码：${manifest.delivery_id}`));
  assert.match(briefXml, /GMV 205K（\+29\.8%）/);
  assert.match(briefXml, /近期市场信号/);
  assert.match(briefXml, /宠物用品安全提醒样例/);
  assert.match(briefXml, /为什么值得看/);
  assert.match(briefXml, /本地市场与季节补充（AI定性分析，未联网核验，仅供参考）/);
  assert.match(briefXml, /结论与动作/);
  assert.match(briefXml, /素材1/);
  assert.match(briefXml, /看板查询完成，但该商品无有效非NULL素材，不补查/);
  assert.doesNotMatch(briefXml, /本次未执行素材查询/);
  assert.doesNotMatch(briefXml, /<table>/);
  assert.doesNotMatch(briefXml, /Conflicting rising-row copy/);
  const emptyMarketSpec = structuredClone(spec);
  emptyMarketSpec.market_context = {
    schema_version: "1.0.0",
    search_available: false,
    attempted: false,
    attempted_at: null,
    queries: [],
    status: "unavailable",
    signals: [],
    blocked_reason: null,
  };
  await fs.writeFile(emptyMarketSpecPath, `${JSON.stringify(emptyMarketSpec, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_feishu_brief.mjs"),
    "--input", emptyMarketSpecPath,
    "--output", emptyMarketBriefPath,
    "--sheet-url", "https://example.larksuite.com/sheets/test",
    "--creative-links", creativeLinksPath,
  ]);
  const emptyMarketBriefXml = await fs.readFile(emptyMarketBriefPath, "utf8");
  assert.doesNotMatch(emptyMarketBriefXml, /近期市场信号/);
  assert.match(emptyMarketBriefXml, /<h1>二、动作标签怎么理解<\/h1>/);
  await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_feishu_brief.mjs"),
    "--input", specPath,
    "--output", blockedBriefPath,
    "--sheet-url", "https://example.larksuite.com/sheets/test",
    "--creative-links", blockedCreativeLinksPath,
  ]);
  const blockedBriefXml = await fs.readFile(blockedBriefPath, "utf8");
  assert.match(blockedBriefXml, /素材查询已尝试但受阻/);
  assert.match(blockedBriefXml, /主报告照常交付/);
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(scriptDir, "build_feishu_brief.mjs"),
      "--input", specPath,
      "--output", path.join(tempDir, "brief-without-sheet.xml"),
      "--creative-links", creativeLinksPath,
    ]),
    /Sheet delivery gate failed/,
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(scriptDir, "build_feishu_brief.mjs"),
      "--input", specPath,
      "--output", path.join(tempDir, "brief-without-creative.xml"),
      "--sheet-url", "https://example.larksuite.com/sheets/test",
    ]),
    /--creative-links/,
  );
  const reportResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_report.mjs"),
    "--input", specPath,
    "--output", reportPath,
    "--preview-dir", previewDir,
    "--creative-links", creativeLinksPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
  assert.match(reportResult.stdout, new RegExp(`"delivery_id":"${manifest.delivery_id}"`));
  assert.match(reportResult.stdout, /"素材链接"/);
  assert.match(reportResult.stdout, /"creative_query_status":"completed"/);
  assert.ok((await fs.stat(reportPath)).size > 0);
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(scriptDir, "build_report.mjs"),
      "--input", specPath,
      "--output", path.join(tempDir, "report-without-creative.xlsx"),
    ]),
    /--creative-links/,
  );
  const metricResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "validate_metrics.mjs"),
    "--input", specPath,
  ]);
  const metricValidation = JSON.parse(metricResult.stdout);
  assert.equal(metricValidation.valid, true);
  assert.equal(metricValidation.delivery_id, manifest.delivery_id);
  assert.deepEqual(metricValidation.recommendation_ids, manifest.recommendation_ids);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(sheetReadbackPath, `${JSON.stringify(readback, null, 2)}\n`, "utf8");
  await fs.writeFile(briefReadbackPath, `${JSON.stringify(readback, null, 2)}\n`, "utf8");
  await fs.writeFile(sheetDeliveryReadbackPath, `${JSON.stringify(sheetReadback, null, 2)}\n`, "utf8");
  const reconcileResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "reconcile_delivery.mjs"),
    "--manifest", manifestPath,
    "--sheet", sheetReadbackPath,
    "--brief", briefReadbackPath,
  ]);
  assert.equal(JSON.parse(reconcileResult.stdout).valid, true);
  const validateSheetResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "validate_sheet_delivery.mjs"),
    "--input", sheetDeliveryReadbackPath,
  ]);
  assert.equal(JSON.parse(validateSheetResult.stdout).valid, true);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const creativeValidationResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "validate_creative_links.mjs"),
    "--input", blockedCreativeLinksPath,
    "--manifest", manifestPath,
  ]);
  assert.equal(JSON.parse(creativeValidationResult.stdout).valid, true);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  valid: true,
  delivery_id: manifest.delivery_id,
  recommendation_ids: manifest.recommendation_ids,
  canonical_conflict_test: "passed",
  mismatch_block_test: "passed",
  exact_2_plus_6_test: "passed",
  brief_same_source_test: "passed",
  workbook_same_source_test: "passed",
  metric_gate_same_source_test: "passed",
  reconcile_cli_test: "passed",
  sheet_delivery_gate_test: "passed",
  atomic_header_contract_test: "passed",
  creative_links_sheet_and_brief_test: "passed",
  creative_query_attempt_gate_test: "passed",
  creative_query_route_gate_test: "passed",
  creative_blocked_nonblocking_test: "passed",
  market_context_gate_test: "passed",
  empty_market_section_omission_test: "passed",
}, null, 2)}\n`);

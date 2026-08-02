import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDeliveryManifest, expectedReadback, reconcileDelivery } from "./delivery_contract.mjs";

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
  recommendations: {
    benchmarks: [
      { product_id: "b2", archetype: "饮水机", action: "仅作标杆", insight: "标杆2" },
      { product_id: "b1", archetype: "猫砂盆", action: "仅作标杆", insight: "标杆1" },
    ],
    growth: [
      { product_id: "g6", archetype: "耳部清洁", action: "小单测试", insight: "增长6" },
      { product_id: "g4", archetype: "猫砂盆", action: "快速跟进", insight: "增长4" },
      { product_id: "g2", archetype: "猫砂盆", action: "快速跟进", insight: "增长2" },
      { product_id: "g5", archetype: "猫砂盆", action: "小单测试", insight: "增长5" },
      { product_id: "g1", archetype: "除臭器", action: "条件跟进", insight: "增长1" },
      { product_id: "g3", archetype: "胸背带", action: "小单测试", insight: "增长3" },
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

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gcrm-delivery-contract-"));
try {
  const specPath = path.join(tempDir, "report-spec.json");
  const briefPath = path.join(tempDir, "brief.xml");
  const reportPath = path.join(tempDir, "report.xlsx");
  const previewDir = path.join(tempDir, "previews");
  const manifestPath = path.join(tempDir, "delivery-manifest.json");
  const sheetReadbackPath = path.join(tempDir, "sheet-readback.json");
  const briefReadbackPath = path.join(tempDir, "brief-readback.json");
  await fs.writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_feishu_brief.mjs"),
    "--input", specPath,
    "--output", briefPath,
    "--sheet-url", "https://example.com/sheet",
  ]);
  const briefXml = await fs.readFile(briefPath, "utf8");
  assert.match(briefXml, /交付校验码 874ad5659748/);
  assert.match(briefXml, /Product ID g1｜数据源 GMV Top 50 #3/);
  assert.match(briefXml, /205K \/ \+29\.8%/);
  assert.doesNotMatch(briefXml, /Conflicting rising-row copy/);
  const reportResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "build_report.mjs"),
    "--input", specPath,
    "--output", reportPath,
    "--preview-dir", previewDir,
  ], { maxBuffer: 10 * 1024 * 1024 });
  assert.match(reportResult.stdout, /"delivery_id":"874ad5659748"/);
  assert.ok((await fs.stat(reportPath)).size > 0);
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
  const reconcileResult = await execFileAsync(process.execPath, [
    path.join(scriptDir, "reconcile_delivery.mjs"),
    "--manifest", manifestPath,
    "--sheet", sheetReadbackPath,
    "--brief", briefReadbackPath,
  ]);
  assert.equal(JSON.parse(reconcileResult.stdout).valid, true);
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
}, null, 2)}\n`);

import fs from "node:fs/promises";
import path from "node:path";
import { buildDeliveryManifest } from "./delivery_contract.mjs";
import { assertCreativeLinks } from "./creative_contract.mjs";

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    result[argv[index].slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return result;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function money(value) {
  return Number.isFinite(value)
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function changeText(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function actionColor(action) {
  return {
    快速跟进: "green",
    条件跟进: "orange",
    小单测试: "blue",
    仅作标杆: "gray",
  }[action] || "gray";
}

function validCreativeLinks(creativeLinks, productId) {
  if (!creativeLinks) return [];
  return (creativeLinks.links || [])
    .filter((item) => String(item.product_id || "") === String(productId))
    .filter((item) => {
      const url = String(item.url || "").trim();
      return url && !/^null$/i.test(url) && /^https?:\/\//i.test(url);
    })
    .sort((a, b) =>
      Number(a.creative_rank || Number.MAX_SAFE_INTEGER)
      - Number(b.creative_rank || Number.MAX_SAFE_INTEGER)
      || Number(b.dollar_revenue || 0) - Number(a.dollar_revenue || 0));
}

const args = argsOf(process.argv.slice(2));
if (!args.input || !args.output || !args["creative-links"]) {
  throw new Error("Usage: node build_feishu_brief.mjs --input report-spec.json --output brief.xml (--sheet-url URL | --fallback-xlsx path) --creative-links creative-links.json [--material-limit 1-3]");
}

const sheetUrl = String(args["sheet-url"] || args["excel-url"] || "").trim();
const fallbackXlsx = String(args["fallback-xlsx"] || "").trim();
if (!sheetUrl && !fallbackXlsx) {
  throw new Error("Sheet delivery gate failed: provide a live --sheet-url or an explicit --fallback-xlsx artifact before building the document");
}
if (sheetUrl && !/\/sheets\//.test(sheetUrl)) {
  throw new Error("--sheet-url must be a live Feishu/Lark Sheet URL containing /sheets/");
}
if (!sheetUrl && fallbackXlsx) {
  try {
    await fs.access(path.resolve(fallbackXlsx));
  } catch {
    throw new Error(`--fallback-xlsx does not exist: ${fallbackXlsx}`);
  }
}

const materialLimit = Number(args["material-limit"] || 2);
if (![1, 2, 3].includes(materialLimit)) {
  throw new Error("--material-limit must be 1, 2, or 3");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const creativeLinks = JSON.parse(await fs.readFile(path.resolve(args["creative-links"]), "utf8"));
const deliveryManifest = buildDeliveryManifest(spec);
const creativeValidation = assertCreativeLinks(creativeLinks, deliveryManifest.recommendation_ids);
const reportCategoryPath = spec.meta.category_path || spec.meta.category;
const reportCategoryLevel = Number(spec.meta.category_level || 1);
const selected = deliveryManifest.recommendations;

const title = `${spec.meta.country}｜${reportCategoryPath}｜${spec.meta.period_start}至${spec.meta.period_end} 爆品推荐`;
const lines = [
  `<title>${esc(title)}</title>`,
  `<p><b>区域</b> ${esc(spec.meta.country)}　<b>类目</b> ${esc(reportCategoryPath)}　<b>类目层级</b> ${reportCategoryLevel === 2 ? "二级" : "一级"}　<b>周期</b> ${esc(spec.meta.period_start)} 至 ${esc(spec.meta.period_end)}</p>`,
  `<p><span text-color="gray">类目口径：GCRM Top Product 一级/二级类目（快照 ${esc(spec.meta.taxonomy_snapshot)}）。完整 Top 50、计算字段和全部有效素材链接见文末飞书电子表格。</span></p>`,
  `<h1>一、本期结论</h1>`,
  `<callout emoji="💡" background-color="light-blue" border-color="blue">`,
];
for (const [index, bullet] of (spec.summary_bullets || []).slice(0, 3).entries()) {
  lines.push(`<p><b>${index + 1}.</b> ${esc(bullet)}</p>`);
}
lines.push(
  `</callout>`,
  `<h1>二、动作标签怎么理解</h1>`,
  `<p><b><span text-color="green">快速跟进</span></b>：规模与增长成立、场景清楚且可复制；优先找同原型或差异化款。</p>`,
  `<p><b><span text-color="orange">条件跟进</span></b>：机会成立，但依赖主播、供应链、售后或合规能力；先确认门槛。</p>`,
  `<p><b><span text-color="blue">小单测试</span></b>：增速亮眼但规模、基数或稳定性不足；先用小库存和内容测试。</p>`,
  `<p><b><span text-color="gray">仅作标杆</span></b>：用于学习价格、内容和产品定义，不等于直接采购建议。</p>`,
);

function appendProduct(item) {
  const metrics = item.metrics;
  lines.push(`<h2>${esc(item.position)}. ${esc(item.chinese_name)}｜${esc(item.group)}·${esc(item.action)}</h2>`);
  if (item.source.image_url) {
    lines.push(`<img href="${esc(item.source.image_url)}" width="180" height="180" name="${esc(item.chinese_name)}.jpg"/>`);
  }
  lines.push(
    `<p><b>核心指标。</b>GMV ${esc(metrics.gmv_range)}（${esc(changeText(metrics.gmv_change))}）；客单价 ${esc(money(metrics.average_price))}；TR（估）${esc(pct(metrics.take_rate_estimate))}；直播占比 ${esc(pct(metrics.live_share))}；短视频占比 ${esc(pct(metrics.video_share))}；${esc(metrics.driver)}。</p>`,
    `<p><b>为什么值得看。</b>${esc(item.insight)}</p>`,
  );
  const localLabel = item.local_context_status === "searched"
    ? "本地市场与季节补充（AI搜索分析，仅供参考）"
    : "本地市场与季节补充（AI定性分析，未联网核验，仅供参考）";
  lines.push(`<p><b>${localLabel}。</b>${esc(item.local_context)}</p>`);
  if (item.local_context_sources.length) {
    const sourceLinks = item.local_context_sources
      .map((url, index) => `<a href="${esc(url)}">本地视角来源${index + 1}</a>`)
      .join("　");
    lines.push(`<p>${sourceLinks}</p>`);
  }
  lines.push(`<p><b>结论与动作。</b><span text-color="${actionColor(item.action)}">${esc(item.action)}</span>｜${esc(item.execution_advice)}</p>`);

  const materials = validCreativeLinks(creativeLinks, item.product_id).slice(0, materialLimit);
  if (materials.length) {
    lines.push(`<p><b>参考素材。</b>${materials.map((material, index) =>
      `<a href="${esc(material.url)}">素材${index + 1}</a>`).join("　")}</p>`);
  } else if (creativeLinks.query_status === "blocked") {
    lines.push(`<p><b>参考素材。</b><span text-color="gray">素材查询已尝试但受阻：${esc(creativeLinks.blocked_reason)}；主报告照常交付。</span></p>`);
  } else {
    lines.push(`<p><b>参考素材。</b><span text-color="gray">看板查询完成，但该商品无有效非NULL素材，不补查。</span></p>`);
  }
}

for (const group of ["标杆", "增长"]) {
  lines.push(`<h1>${group === "标杆" ? "三、标杆品" : "四、增长品"}</h1>`);
  for (const item of selected.filter((recommendation) => recommendation.group === group)) {
    appendProduct(item);
  }
}

lines.push(`<h1>五、完整数据与素材</h1>`);
if (sheetUrl) {
  lines.push(`<p><a type="url-preview" href="${esc(sheetUrl)}">查看完整飞书电子表格</a></p>`);
} else {
  lines.push(`<p><b>电子表格降级交付：</b>${esc(fallbackXlsx)}。当前未能创建飞书电子表格，文档不得声称已嵌入在线表格。</p>`);
}
lines.push(
  `<p><span text-color="gray">口径：客单价直接取网页展示值；TR（估）=广告消耗区间中点÷总GMV区间中点。区间中点仅用于方向判断，不替代精确财务口径；本地视角属于定性解释，不证明因果。</span></p>`,
  `<p><span text-color="gray">交付校验码：${esc(deliveryManifest.delivery_id)}</span></p>`,
);

await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await fs.writeFile(path.resolve(args.output), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  output: path.resolve(args.output),
  title,
  delivery_id: deliveryManifest.delivery_id,
  recommendations: selected.length,
  sheet_linked: Boolean(sheetUrl),
  fallback_xlsx: fallbackXlsx || null,
  creative_query_status: creativeValidation.query_status,
  creative_links: creativeValidation.link_count,
}, null, 2)}\n`);

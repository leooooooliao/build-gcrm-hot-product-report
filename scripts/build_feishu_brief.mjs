import fs from "node:fs/promises";
import path from "node:path";
import { buildDeliveryManifest } from "./delivery_contract.mjs";

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

const args = argsOf(process.argv.slice(2));
if (!args.input || !args.output) {
  throw new Error("Usage: node build_feishu_brief.mjs --input report-spec.json --output brief.xml [--sheet-url URL] [--sheet-name name]");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const deliveryManifest = buildDeliveryManifest(spec);
const reportCategoryPath = spec.meta.category_path || spec.meta.category;
const reportCategoryLevel = Number(spec.meta.category_level || 1);
const sheetUrl = args["sheet-url"] || args["excel-url"] || "";
const selected = deliveryManifest.recommendations;

const title = `${spec.meta.country}｜${reportCategoryPath}｜${spec.meta.period_start}至${spec.meta.period_end} 爆品推荐`;
const lines = [
  `<title>${esc(title)}</title>`,
  `<p><b>区域</b> ${esc(spec.meta.country)}　<b>类目</b> ${esc(reportCategoryPath)}　<b>类目层级</b> ${reportCategoryLevel === 2 ? "二级" : "一级"}　<b>周期</b> ${esc(spec.meta.period_start)} 至 ${esc(spec.meta.period_end)}</p>`,
  `<p><span text-color="gray">类目口径：GCRM Top Product 一级/二级类目（快照 ${esc(spec.meta.taxonomy_snapshot)}）；交付校验码 ${esc(deliveryManifest.delivery_id)}；完整 Top 50 与原始证据见配套飞书电子表格。</span></p>`,
  `<h1>本期判断</h1>`,
  `<callout emoji="💡" background-color="light-blue" border-color="blue">`,
];
for (const [index, bullet] of (spec.summary_bullets || []).slice(0, 3).entries()) {
  lines.push(`<p><b>${index + 1}.</b> ${esc(bullet)}</p>`);
}
lines.push(`</callout>`, `<h1>核心推荐</h1>`);

selected.forEach((item, index) => {
  const row = item.source;
  const metrics = item.metrics;
  const chineseName = item.chinese_name;
  lines.push(
    `<p><b>${index + 1}. ${esc(chineseName)}</b>　<span text-color="gray">${esc(item.group)}</span>　<span text-color="${actionColor(item.action)}">${esc(item.action)}</span></p>`,
    `<p><span text-color="gray">Product ID ${esc(item.product_id)}｜数据源 ${esc(item.source_banner)} #${esc(item.source_rank)}｜商品原型 ${esc(item.archetype)}</span></p>`,
  );
  const metricTable = [
    `<table>`,
    `<colgroup><col width="170"/><col width="170"/><col width="240"/></colgroup>`,
    `<thead><tr><th background-color="light-gray">GMV / 增速</th><th background-color="light-gray">客单价 / TR（估）</th><th background-color="light-gray">渠道结构</th></tr></thead>`,
    `<tbody><tr><td>${esc(metrics.gmv_range)} / ${esc(changeText(metrics.gmv_change))}</td><td>${esc(money(metrics.average_price))} / ${esc(pct(metrics.take_rate_estimate))}</td><td>直播 ${esc(pct(metrics.live_share))} / 短视频 ${esc(pct(metrics.video_share))} / ${esc(metrics.driver)}</td></tr></tbody>`,
    `</table>`,
  ].join("");
  if (row.image_url) {
    lines.push(
      `<grid>`,
      `<column width-ratio="0.18"><img href="${esc(row.image_url)}" width="120" height="120" name="${esc(chineseName)}.jpg"/></column>`,
      `<column width-ratio="0.82">${metricTable}<p><b>推荐理由与建议。</b>${esc(item.insight)}</p></column>`,
      `</grid>`,
    );
  } else {
    lines.push(metricTable, `<p><b>推荐理由与建议。</b>${esc(item.insight)}</p>`);
  }
  if (index < selected.length - 1) lines.push(`<hr/>`);
});

lines.push(
  `<h1>建议动作定义</h1>`,
  `<table>`,
  `<colgroup><col width="120"/><col width="520"/></colgroup>`,
  `<thead><tr><th background-color="light-gray">建议动作</th><th background-color="light-gray">判断标准与使用方式</th></tr></thead>`,
  `<tbody>`,
  `<tr><td><b>快速跟进</b></td><td>规模与增长成立、场景清楚且可复制；优先找同原型或差异化款。</td></tr>`,
  `<tr><td><b>条件跟进</b></td><td>机会成立，但依赖主播、供应链、售后或合规能力；先确认门槛。</td></tr>`,
  `<tr><td><b>小单测试</b></td><td>增速亮眼但规模、基数或稳定性不足；先用小库存和内容测试验证。</td></tr>`,
  `<tr><td><b>仅作标杆</b></td><td>规模高但不适合直接复制；用于学习价格、内容和产品定义，不等于采购建议。</td></tr>`,
  `</tbody></table>`,
  `<h1>完整数据</h1>`,
);
if (sheetUrl) {
  lines.push(`<p><a type="url-preview" href="${esc(sheetUrl)}">查看完整飞书电子表格</a></p>`);
} else {
  lines.push(`<p>配套表格：${esc(args["sheet-name"] || "同名飞书电子表格")}。完整 Top 50、图片与原始口径均保留在表格中。</p>`);
}
lines.push(`<p><span text-color="gray">口径：客单价直接取网页展示值；TR（估）=广告消耗区间中点÷总GMV区间中点。区间中点仅用于估算，不替代精确财务口径。</span></p>`);

await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await fs.writeFile(path.resolve(args.output), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  output: path.resolve(args.output),
  title,
  delivery_id: deliveryManifest.delivery_id,
  recommendations: selected.length,
  sheet_linked: Boolean(sheetUrl),
}, null, 2)}\n`);

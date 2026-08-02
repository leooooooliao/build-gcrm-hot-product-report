import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const COLORS = {
  navy: "#17324D",
  green: "#17803D",
  red: "#C43232",
  amber: "#A16207",
  blue: "#2563A6",
  gray900: "#202B37",
  gray700: "#475467",
  gray500: "#667085",
  gray300: "#D0D5DD",
  gray200: "#E4E7EC",
  white: "#FFFFFF",
};

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    result[argv[i].slice(2)] = argv[i + 1] ?? "";
    i += 1;
  }
  return result;
}

const args = argsOf(process.argv.slice(2));
if (!args.input || !args.output) {
  throw new Error("Usage: node build_report.mjs --input report.json --output report.xlsx [--preview-dir dir]");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const output = path.resolve(args.output);
const previewDir = path.resolve(args["preview-dir"] || `${output}.previews`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const bannerOrder = ["GMV Top 50", "销量 Top 50", "广告消耗 Top 50", "飙升 Top 50"];
const requiredMeta = ["country", "category", "period_start", "period_end", "source_url", "taxonomy_snapshot"];
for (const field of requiredMeta) {
  if (!spec.meta?.[field]) throw new Error(`Missing meta.${field}`);
}
if (!Array.isArray(spec.rankings?.["GMV Top 50"]) || !spec.rankings["GMV Top 50"].length) {
  throw new Error("rankings['GMV Top 50'] must contain rows");
}
for (const banner of bannerOrder) {
  const rows = spec.rankings[banner] || [];
  if (!Array.isArray(rows)) throw new Error(`${banner} must be an array`);
  if (rows.length > 50) throw new Error(`${banner} contains ${rows.length} rows; maximum is 50`);
}

function numToken(token) {
  const match = String(token ?? "")
    .replace(/,/g, "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const factor = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1;
  return Number(match[1]) * factor;
}

function metric(value) {
  const [range = "", changeRaw = ""] = String(value ?? "").split("\n");
  const clean = range.trim();
  let mid = null;
  if (clean) {
    if (clean.endsWith("+")) {
      mid = numToken(clean.slice(0, -1));
    } else {
      const parts = clean.split(/\s+-\s+/);
      if (parts.length === 2) {
        const lo = numToken(parts[0]);
        const hi = numToken(parts[1]);
        if (lo != null && hi != null) mid = (lo + hi) / 2;
      } else {
        mid = numToken(clean);
      }
    }
  }
  const match = String(changeRaw).trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  const change = match ? Number(match[1]) / 100 : null;
  return {
    range: clean,
    change,
    mid,
    prior: mid != null && change != null && change > -0.95 ? mid / (1 + change) : null,
  };
}

function asTextFormula(value) {
  return `="${String(value ?? "").replace(/"/g, '""')}"`;
}

function safeSheetFormula(sheetName, cell) {
  return `='${sheetName}'!${cell}`;
}

function productKey(row) {
  return String(row.product_id || `${row.shop_name || ""}|${row.product_name || ""}`);
}

const rawRows = bannerOrder.flatMap((banner) =>
  (spec.rankings[banner] || []).slice(0, 50).map((row) => ({ banner, row })),
);
for (const { banner, row } of rawRows) {
  if (!(metric(row.gmv_total).mid > 0)) {
    throw new Error(`${banner} rank ${row.rank}: missing or invalid gmv_total`);
  }
  const averagePrice = metric(row.avg_price).mid;
  if (!(Number.isFinite(averagePrice) && averagePrice >= 0)) {
    throw new Error(`${banner} rank ${row.rank}: missing or invalid avg_price`);
  }
  const adsCost = metric(row.ads_cost).mid;
  if (!(Number.isFinite(adsCost) && adsCost >= 0)) {
    throw new Error(`${banner} rank ${row.rank}: missing or invalid ads_cost`);
  }
}
const productTranslations = spec.product_translations || {};
function translatedName(row) {
  return String(productTranslations[productKey(row)] || "").trim();
}
const missingTranslations = [
  ...new Set(
    rawRows
      .filter(({ row }) => !translatedName(row))
      .map(({ row }) => productKey(row)),
  ),
];
if (missingTranslations.length) {
  throw new Error(
    `Missing Chinese product names for ${missingTranslations.length} products: ${missingTranslations.slice(0, 10).join(", ")}`,
  );
}
const gmvRows = (spec.rankings["GMV Top 50"] || []).slice(0, 50);
const risingRows = (spec.rankings["飙升 Top 50"] || []).slice(0, 50);
const poolRows = [];
const poolSeen = new Set();
for (const item of [
  ...gmvRows.map((row) => ({ banner: "GMV Top 50", row })),
  ...risingRows.map((row) => ({ banner: "飙升 Top 50", row })),
]) {
  const key = productKey(item.row);
  if (!poolSeen.has(key)) {
    poolSeen.add(key);
    poolRows.push(item);
  }
}

const recommendationGroups = [
  {
    title: "一直在卖｜标杆爆品",
    name: "BenchmarkProducts",
    items: (spec.recommendations?.benchmarks || []).slice(0, 4),
    prefix: "标杆",
  },
  {
    title: "高速增长｜核心推荐",
    name: "GrowthProducts",
    items: (spec.recommendations?.growth || []).slice(0, 10),
    prefix: "高增",
  },
];
const allRecommendations = recommendationGroups.flatMap((group) => group.items);
const allowedActions = new Set(["快速跟进", "条件跟进", "小单测试", "仅作标杆"]);
const recommendationIds = allRecommendations.map((item) => String(item.product_id || ""));
if (new Set(recommendationIds).size !== recommendationIds.length) {
  throw new Error("Duplicate recommendation product_id values are not allowed");
}
for (const item of allRecommendations) {
  if (!item.product_id) throw new Error("Recommendation product_id is required");
  if (!allowedActions.has(item.action)) {
    throw new Error(`Invalid recommendation action for ${item.product_id}: ${item.action}`);
  }
}
const candidateById = new Map(
  [...gmvRows, ...risingRows].map((row) => [String(row.product_id), row]),
);
for (const item of allRecommendations) {
  if (!candidateById.has(String(item.product_id))) {
    throw new Error(`Recommendation product_id not found: ${item.product_id}`);
  }
}

const workbook = Workbook.create();
const conclusion = workbook.worksheets.add("结论");
const poolSheet = workbook.worksheets.add("选品池");
const rawSheet = workbook.worksheets.add("Top50原始榜单");
const guideSheet = workbook.worksheets.add("使用说明");
for (const sheet of [conclusion, poolSheet, rawSheet, guideSheet]) {
  sheet.showGridLines = false;
}

function styleHeader(range) {
  range.format = {
    fill: COLORS.navy,
    font: { color: COLORS.white, bold: true, size: 9 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: false,
  };
}

function setTitle(sheet, range, value) {
  const target = sheet.getRange(range);
  target.merge();
  target.values = [[value]];
  target.format = {
    font: { color: COLORS.navy, bold: true, size: 20 },
    verticalAlignment: "center",
    borders: { bottom: { style: "medium", color: COLORS.navy } },
  };
}

function setSubtitle(sheet, range, value) {
  const target = sheet.getRange(range);
  target.merge();
  target.values = [[value]];
  target.format = { font: { color: COLORS.gray500, size: 9 }, verticalAlignment: "center" };
}

function setSection(sheet, range, value) {
  const target = sheet.getRange(range);
  target.merge();
  target.values = [[value]];
  target.format = {
    font: { color: COLORS.navy, bold: true, size: 12 },
    verticalAlignment: "center",
    borders: { bottom: { style: "thin", color: COLORS.navy } },
  };
}

function addChangeFont(sheet, range, anchor) {
  sheet.getRange(range).conditionalFormats.addCustom(`=${anchor}>0`, {
    font: { color: COLORS.green },
  });
  sheet.getRange(range).conditionalFormats.addCustom(`=${anchor}<0`, {
    font: { color: COLORS.red },
  });
}

function addActionFont(sheet, range, anchor) {
  sheet.getRange(range).conditionalFormats.addCustom(`=${anchor}="快速跟进"`, {
    font: { color: COLORS.green, bold: true },
  });
  sheet.getRange(range).conditionalFormats.addCustom(`=${anchor}="条件跟进"`, {
    font: { color: COLORS.amber, bold: true },
  });
  sheet.getRange(range).conditionalFormats.addCustom(`=${anchor}="小单测试"`, {
    font: { color: COLORS.blue, bold: true },
  });
}

// Raw source
setTitle(rawSheet, "A1:AI1", `${spec.meta.country} · ${spec.meta.category} · Top 50 原始榜单`);
setSubtitle(
  rawSheet,
  "A2:AI2",
  `${spec.meta.period_start} 至 ${spec.meta.period_end}｜数据保留网页区间｜来源：${spec.meta.source_url}`,
);
const rawHeaders = [
  "榜单", "Rank", "中文商品简称", "Product Name", "Product ID", "一级类目", "二级类目", "三级类目",
  "GMV区间", "GMV变化", "直播GMV区间", "短视频GMV区间", "商品卡GMV区间",
  "订单量区间", "平均价格", "广告消耗区间", "退款率区间", "店铺", "图片URL",
  "匹配质量", "开始日期", "结束日期", "来源页面", "GMV中点（辅助）",
  "直播GMV中点（辅助）", "短视频GMV中点（辅助）", "商品卡GMV中点（辅助）",
  "广告消耗中点（辅助）", "上期GMV估算（辅助）", "可比GMV中点（辅助）",
  "直播占比（估）", "短视频占比（估）", "商品卡占比（估）", "TR（估）", "主要驱动",
];
rawSheet.getRange("A4:AI4").values = [rawHeaders];
styleHeader(rawSheet.getRange("A4:AI4"));
const rawFirst = 5;
const rawLast = rawFirst + rawRows.length - 1;
const rawValues = rawRows.map(({ banner, row }) => {
  const total = metric(row.gmv_total);
  const live = metric(row.gmv_live);
  const video = metric(row.gmv_video);
  const card = metric(row.gmv_product_card);
  const orders = metric(row.order_volume);
  const price = metric(row.avg_price);
  const ads = metric(row.ads_cost);
  return [
    banner, row.rank, translatedName(row), row.product_name, null,
    row.category_l1, row.category_l2, row.category_l3,
    total.range, total.change, live.range, video.range, card.range, orders.range, price.mid,
    ads.range, metric(row.refund_rate).range, row.shop_name, row.image_url,
    row.join_quality || "", spec.meta.period_start, spec.meta.period_end, spec.meta.source_url,
    total.mid, live.mid, video.mid, card.mid, ads.mid, total.prior,
    total.prior != null ? total.mid : null, null, null, null, null, null,
  ];
});
rawSheet.getRange(`A${rawFirst}:AI${rawLast}`).values = rawValues;
rawSheet.getRange(`E${rawFirst}:E${rawLast}`).formulas =
  rawRows.map(({ row }) => [asTextFormula(row.product_id)]);
rawSheet.getRange(`AE${rawFirst}:AE${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-6]/RC[-7],"")']);
rawSheet.getRange(`AF${rawFirst}:AF${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-6]/RC[-8],"")']);
rawSheet.getRange(`AG${rawFirst}:AG${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-6]/RC[-9],"")']);
rawSheet.getRange(`AH${rawFirst}:AH${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-6]/RC[-10],"")']);
rawSheet.getRange(`AI${rawFirst}:AI${rawLast}`).formulasR1C1 =
  rawRows.map(() => [
    '=IF(AND(RC[-4]>=0.5,RC[-4]>RC[-3]),"直播驱动",IF(AND(RC[-3]>=0.5,RC[-3]>RC[-4]),"短视频驱动","混合/其他"))',
  ]);
const rawTable = rawSheet.tables.add(`A4:AI${rawLast}`, true, "GcrmTop50Raw");
rawTable.style = "TableStyleLight1";
rawTable.showBandedRows = false;
rawTable.showFilterButton = true;
styleHeader(rawSheet.getRange("A4:AI4"));
rawSheet.getRange(`A${rawFirst}:AI${rawLast}`).format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
rawSheet.getRange(`E${rawFirst}:E${rawLast}`).format.numberFormat = "@";
rawSheet.getRange(`J${rawFirst}:J${rawLast}`).format.numberFormat = "0.0%";
rawSheet.getRange(`O${rawFirst}:O${rawLast}`).format.numberFormat = '"$"#,##0.00';
rawSheet.getRange(`X${rawFirst}:AD${rawLast}`).format.numberFormat = '"$"#,##0';
rawSheet.getRange(`AE${rawFirst}:AH${rawLast}`).format.numberFormat = "0.0%";
addChangeFont(rawSheet, `J${rawFirst}:J${rawLast}`, `J${rawFirst}`);
const rawWidths = {
  A: 100, B: 48, C: 210, D: 330, E: 155, F: 110, G: 150, H: 160, I: 90, J: 75,
  K: 105, L: 115, M: 115, N: 95, O: 80, P: 105, Q: 90, R: 130, S: 230,
  T: 115, U: 88, V: 88, W: 230, X: 100, Y: 105, Z: 115, AA: 115, AB: 110,
  AC: 110, AD: 115, AE: 88, AF: 98, AG: 100, AH: 74, AI: 88,
};
for (const [col, width] of Object.entries(rawWidths)) {
  rawSheet.getRange(`${col}1:${col}${rawLast}`).format.columnWidthPx = width;
}
rawSheet.getRange("A4:AI4").format.rowHeightPx = 34;
rawSheet.getRange(`A${rawFirst}:AI${rawLast}`).format.rowHeightPx = 26;
rawSheet.freezePanes.freezeRows(4);
rawSheet.freezePanes.freezeColumns(5);

const rawLocation = new Map();
rawRows.forEach(({ banner, row }, index) => {
  rawLocation.set(`${banner}|${String(row.product_id)}`, rawFirst + index);
});

const recommendationById = new Map(
  allRecommendations.map((item) => [String(item.product_id), item]),
);

// Selection pool
setTitle(poolSheet, "A1:Z1", `${spec.meta.country} · ${spec.meta.category} · 选品池`);
setSubtitle(
  poolSheet,
  "A2:Z2",
  `GMV Top 50 + 飙升 Top 50 去重｜${spec.meta.period_start} 至 ${spec.meta.period_end}｜中英文商品名保持单行`,
);
const poolHeaders = [
  "来源榜单", "Rank", "图片", "中文商品简称", "Product Name", "Product ID",
  "二级类目", "三级类目", "建议动作", "GMV区间", "GMV变化", "客单价（网页口径）",
  "广告消耗区间", "TR（估）", "直播占比（估）", "短视频占比（估）", "主要驱动",
  "订单量区间", "店铺", "匹配质量", "图片URL", "来源页面", "GMV中点（辅助）",
  "直播GMV中点（辅助）", "短视频GMV中点（辅助）", "广告消耗中点（辅助）",
];
poolSheet.getRange("A4:Z4").values = [poolHeaders];
styleHeader(poolSheet.getRange("A4:Z4"));
const poolFirst = 5;
const poolLast = poolFirst + poolRows.length - 1;
const poolValues = poolRows.map(({ banner, row }) => {
  const total = metric(row.gmv_total);
  return [
    banner, row.rank, "", translatedName(row), row.product_name, null,
    row.category_l2, row.category_l3,
    recommendationById.get(String(row.product_id))?.action || "—",
    total.range, total.change, metric(row.avg_price).mid, metric(row.ads_cost).range,
    null, null, null, null, metric(row.order_volume).range, row.shop_name,
    row.join_quality || "", row.image_url, spec.meta.source_url, total.mid,
    metric(row.gmv_live).mid, metric(row.gmv_video).mid, metric(row.ads_cost).mid,
  ];
});
poolSheet.getRange(`A${poolFirst}:Z${poolLast}`).values = poolValues;
poolSheet.getRange(`F${poolFirst}:F${poolLast}`).formulas =
  poolRows.map(({ row }) => [asTextFormula(row.product_id)]);
poolSheet.getRange(`N${poolFirst}:N${poolLast}`).formulasR1C1 =
  poolRows.map(() => ['=IFERROR(RC[12]/RC[9],"")']);
poolSheet.getRange(`O${poolFirst}:O${poolLast}`).formulasR1C1 =
  poolRows.map(() => ['=IFERROR(RC[9]/RC[8],"")']);
poolSheet.getRange(`P${poolFirst}:P${poolLast}`).formulasR1C1 =
  poolRows.map(() => ['=IFERROR(RC[9]/RC[7],"")']);
poolSheet.getRange(`Q${poolFirst}:Q${poolLast}`).formulasR1C1 =
  poolRows.map(() => [
    '=IF(AND(RC[-2]>=0.5,RC[-2]>RC[-1]),"直播驱动",IF(AND(RC[-1]>=0.5,RC[-1]>RC[-2]),"短视频驱动","混合/其他"))',
  ]);
const poolTable = poolSheet.tables.add(`A4:Z${poolLast}`, true, "GcrmSelectionPool");
poolTable.style = "TableStyleLight1";
poolTable.showBandedRows = false;
poolTable.showFilterButton = true;
styleHeader(poolSheet.getRange("A4:Z4"));
poolSheet.getRange(`A${poolFirst}:Z${poolLast}`).format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
poolSheet.getRange(`C${poolFirst}:C${poolLast}`).format.rowHeightPx = 58;
poolSheet.getRange(`F${poolFirst}:F${poolLast}`).format.numberFormat = "@";
poolSheet.getRange(`K${poolFirst}:K${poolLast}`).format.numberFormat = "0.0%";
poolSheet.getRange(`L${poolFirst}:L${poolLast}`).format.numberFormat = '"$"#,##0.00';
poolSheet.getRange(`N${poolFirst}:P${poolLast}`).format.numberFormat = "0.0%";
poolSheet.getRange(`W${poolFirst}:Z${poolLast}`).format.numberFormat = '"$"#,##0';
addChangeFont(poolSheet, `K${poolFirst}:K${poolLast}`, `K${poolFirst}`);
addActionFont(poolSheet, `I${poolFirst}:I${poolLast}`, `I${poolFirst}`);
const poolWidths = {
  A: 100, B: 48, C: 62, D: 210, E: 330, F: 155, G: 150, H: 160, I: 82, J: 90,
  K: 72, L: 105, M: 105, N: 74, O: 90, P: 100, Q: 88, R: 90, S: 130, T: 115,
  U: 220, V: 230, W: 100, X: 110, Y: 118, Z: 115,
};
for (const [col, width] of Object.entries(poolWidths)) {
  poolSheet.getRange(`${col}1:${col}${poolLast}`).format.columnWidthPx = width;
}
poolSheet.getRange("A4:Z4").format.rowHeightPx = 34;
poolSheet.freezePanes.freezeRows(4);
poolSheet.freezePanes.freezeColumns(6);

// Conclusion
setTitle(conclusion, "A1:N1", `${spec.meta.country} ${spec.meta.category}选品报告`);
setSubtitle(
  conclusion,
  "A2:N2",
  `周期：${spec.meta.period_start} 至 ${spec.meta.period_end}｜Top 50｜TR=广告消耗中点/总GMV中点｜绿色=增长，红色=下降`,
);
setSection(conclusion, "A4:N4", "本期怎么选");
const summaryBullets = (spec.summary_bullets || []).slice(0, 3);
while (summaryBullets.length < 3) summaryBullets.push("本期暂无补充结论。");
conclusion.getRange("A5:N7").values = summaryBullets.map((text, index) => [
  String(index + 1), text, null, null, null, null, null, null, null, null, null, null, null, null,
]);
for (const row of [5, 6, 7]) conclusion.getRange(`B${row}:N${row}`).merge();
conclusion.getRange("A5:N7").format = {
  font: { color: COLORS.gray900, size: 10 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
conclusion.getRange("A5:A7").format = {
  font: { color: COLORS.navy, bold: true, size: 11 },
  horizontalAlignment: "center",
};
conclusion.getRange("A5:N7").format.rowHeightPx = 28;

const imagePlacements = [];

function recommendationSourceRow(item) {
  const id = String(item.product_id);
  return rawLocation.get(`GMV Top 50|${id}`) || rawLocation.get(`飙升 Top 50|${id}`);
}

function writeRecommendationSection(startRow, group) {
  if (!group.items.length) return startRow - 1;
  setSection(conclusion, `A${startRow}:N${startRow}`, group.title);
  const headerRow = startRow + 1;
  const firstRow = startRow + 2;
  const lastRow = firstRow + group.items.length - 1;
  conclusion.getRange(`A${headerRow}:N${headerRow}`).values = [[
    "定位", "图片", "商品原型", "中文商品简称", "Product Name", "建议动作", "GMV区间", "增速",
    "客单价（网页口径）", "TR（估）", "直播占比", "短视频占比", "主要驱动", "推荐理由与执行建议",
  ]];
  styleHeader(conclusion.getRange(`A${headerRow}:N${headerRow}`));
  conclusion.getRange(`A${firstRow}:N${lastRow}`).values = group.items.map((item) => {
    const product = candidateById.get(String(item.product_id));
    return [
      `${group.prefix} #${product.rank}`, "", item.archetype, translatedName(product),
      product.product_name, item.action, null, null, null, null, null, null, null, item.insight,
    ];
  });
  group.items.forEach((item, index) => {
    const sourceRow = recommendationSourceRow(item);
    const targetRow = firstRow + index;
    conclusion.getRange(`G${targetRow}:M${targetRow}`).formulas = [[
      safeSheetFormula("Top50原始榜单", `I${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `J${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `O${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AH${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AE${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AF${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AI${sourceRow}`),
    ]];
    const product = candidateById.get(String(item.product_id));
    if (product.image_url) {
      imagePlacements.push({ sheet: conclusion, row: targetRow - 1, col: 1, url: product.image_url });
    }
  });
  const table = conclusion.tables.add(`A${headerRow}:N${lastRow}`, true, group.name);
  table.style = "TableStyleLight1";
  table.showBandedRows = false;
  table.showFilterButton = false;
  styleHeader(conclusion.getRange(`A${headerRow}:N${headerRow}`));
  conclusion.getRange(`A${firstRow}:N${lastRow}`).format = {
    fill: COLORS.white,
    font: { color: COLORS.gray900, size: 9 },
    verticalAlignment: "center",
    wrapText: false,
    borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
  };
  conclusion.getRange(`N${firstRow}:N${lastRow}`).format.wrapText = true;
  conclusion.getRange(`H${firstRow}:H${lastRow}`).format.numberFormat = "0.0%";
  conclusion.getRange(`I${firstRow}:I${lastRow}`).format.numberFormat = '"$"#,##0.00';
  conclusion.getRange(`J${firstRow}:L${lastRow}`).format.numberFormat = "0.0%";
  conclusion.getRange(`A${firstRow}:N${lastRow}`).format.rowHeightPx = 58;
  conclusion.getRange(`A${headerRow}:N${headerRow}`).format.rowHeightPx = 30;
  addChangeFont(conclusion, `H${firstRow}:H${lastRow}`, `H${firstRow}`);
  addActionFont(conclusion, `F${firstRow}:F${lastRow}`, `F${firstRow}`);
  return lastRow;
}

let cursor = 9;
for (const group of recommendationGroups) {
  if (!group.items.length) continue;
  const last = writeRecommendationSection(cursor, group);
  cursor = last + 2;
}

const categoryMetrics = new Map();
for (const row of gmvRows) {
  const category = row.category_l2 || "未分类";
  const total = metric(row.gmv_total);
  if (!categoryMetrics.has(category)) categoryMetrics.set(category, 0);
  categoryMetrics.set(category, categoryMetrics.get(category) + (total.mid || 0));
}
const categories = [...categoryMetrics.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 7)
  .map(([category]) => category);

setSection(conclusion, `A${cursor}:N${cursor}`, "类目机会｜先看规模，再看增长");
const categoryHeader = cursor + 1;
const categoryFirst = cursor + 2;
const categoryLast = categoryFirst + categories.length - 1;
conclusion.getRange(`A${categoryHeader}:H${categoryHeader}`).values = [[
  "二级类目", "Top50商品数", "Top50 GMV中点", "正增长商品数",
  "Top50估算增幅", "直播占比", "短视频占比", "商家怎么做",
]];
styleHeader(conclusion.getRange(`A${categoryHeader}:H${categoryHeader}`));
conclusion.getRange(`A${categoryFirst}:H${categoryLast}`).values = categories.map((category) => [
  category, null, null, null, null, null, null,
  spec.category_actions?.[category] || "结合规模、增长和内容适配度决定测试优先级",
]);
const rawColumnRange = (column) =>
  `'Top50原始榜单'!$${column}$${rawFirst}:$${column}$${rawLast}`;
categories.forEach((category, index) => {
  const row = categoryFirst + index;
  conclusion.getRange(`B${row}:G${row}`).formulas = [[
    `=COUNTIFS(${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})`,
    `=SUMIFS(${rawColumnRange("X")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})`,
    `=COUNTIFS(${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row},${rawColumnRange("J")},">0")`,
    `=IFERROR(SUMIFS(${rawColumnRange("AD")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})/SUMIFS(${rawColumnRange("AC")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})-1,"")`,
    `=IFERROR(SUMIFS(${rawColumnRange("Y")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})/SUMIFS(${rawColumnRange("X")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row}),"")`,
    `=IFERROR(SUMIFS(${rawColumnRange("Z")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row})/SUMIFS(${rawColumnRange("X")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("G")},$A${row}),"")`,
  ]];
});
const categoryTable = conclusion.tables.add(
  `A${categoryHeader}:H${categoryLast}`,
  true,
  "CategoryOpportunities",
);
categoryTable.style = "TableStyleLight1";
categoryTable.showBandedRows = false;
categoryTable.showFilterButton = false;
styleHeader(conclusion.getRange(`A${categoryHeader}:H${categoryHeader}`));
conclusion.getRange(`A${categoryFirst}:H${categoryLast}`).format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
conclusion.getRange(`C${categoryFirst}:C${categoryLast}`).format.numberFormat = '"$"#,##0';
conclusion.getRange(`E${categoryFirst}:G${categoryLast}`).format.numberFormat = "0.0%";
conclusion.getRange(`A${categoryFirst}:H${categoryLast}`).format.rowHeightPx = 27;
addChangeFont(conclusion, `E${categoryFirst}:E${categoryLast}`, `E${categoryFirst}`);

const caveatRow = categoryLast + 2;
conclusion.getRange(`A${caveatRow}:N${caveatRow + 1}`).merge();
conclusion.getRange(`A${caveatRow}:N${caveatRow + 1}`).values = [[
  "口径：客单价直接取网页展示值；TR（估）=广告消耗区间中点÷总GMV区间中点；直播/短视频占比同样按区间中点估算。高增可能受新品、低基数、促销或季节影响；定性解释标注“推测”，不代表因果证明。",
]];
conclusion.getRange(`A${caveatRow}:N${caveatRow + 1}`).format = {
  font: { color: COLORS.gray500, size: 9 },
  wrapText: true,
  verticalAlignment: "center",
  borders: { top: { style: "thin", color: COLORS.gray300 } },
};
const conclusionWidths = {
  A: 92, B: 62, C: 135, D: 190, E: 280, F: 82, G: 90, H: 68, I: 105, J: 72,
  K: 82, L: 92, M: 86, N: 400,
};
for (const [col, width] of Object.entries(conclusionWidths)) {
  conclusion.getRange(`${col}1:${col}${caveatRow + 1}`).format.columnWidthPx = width;
}
conclusion.getRange("A1:N1").format.rowHeightPx = 38;
conclusion.freezePanes.freezeRows(2);

// Guide
setTitle(guideSheet, "A1:D1", "使用说明｜每次只拉一个市场与一个类目");
setSubtitle(
  guideSheet,
  "A2:D2",
  `类目版本：GCRM Top Product 一级类目（快照 ${spec.meta.taxonomy_snapshot}）`,
);
guideSheet.getRange("A4:D4").values = [[
  "输入", "需要用户给什么", "可选项 / 示例", "不清楚时怎么追问",
]];
styleHeader(guideSheet.getRange("A4:D4"));
guideSheet.getRange("A5:D7").values = [
  [
    "1. 国家", "选择一个国家或SEA汇总",
    "US / GB / DE / FR / IT / ES / IE / JP；SEA下可选 TH / ID / VN / PH / MY / SG",
    "如果只说“东南亚”，追问是SEA汇总，还是具体 TH、MY、VN、PH、ID、SG。",
  ],
  [
    "2. 一级类目", "使用平台筛选器里的准确一级类目",
    "例如：宠物用品、美妆个护、家居用品、运动与户外、汽车与摩托车",
    "如果类目不在当前版本，给最多3个近似候选并要求确认；不要自行猜。",
  ],
  [
    "3. 时间周期", "明确开始日和结束日",
    "例如：最近30天，或 2026-06-25 至 2026-07-25",
    "如果只说“最近”，建议最近完整30天，并让用户确认。",
  ],
];
guideSheet.getRange("A5:D7").format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 10 },
  verticalAlignment: "center",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
setSection(guideSheet, "A9:D9", "必备指标与固定口径");
guideSheet.getRange("A10:D13").values = [
  ["客单价", "直接读取网页展示值", "不使用GMV÷订单量反算", "推荐、选品池、原始榜单、飞书简报都必须出现"],
  ["TR（估）", "广告消耗区间中点÷总GMV区间中点", "展示1位小数百分比", "只作粗略投放强度判断，不等同精确财务口径"],
  ["渠道占比（估）", "对应渠道GMV区间中点÷总GMV区间中点", "直播与短视频分别展示", "区间独立模糊，合计可能不等于100%"],
  ["缺失处理", "推荐商品缺任一必备指标即停止完整交付", "不得臆造或用0补齐", "回到网页或数据响应补采"],
];
guideSheet.getRange("A10:D13").format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
setSection(guideSheet, "A15:D15", "建议动作怎么理解");
guideSheet.getRange("A16:D19").values = [
  ["快速跟进", "规模与增长成立，场景清楚，商家可快速复制", "优先找同原型/差异化款", "仍需核价、履约与合规"],
  ["条件跟进", "机会成立，但依赖主播、供应链、售后或合规能力", "先确认门槛再投入", "条件不满足则不跟"],
  ["小单测试", "增速亮眼但规模、基数或稳定性不足", "先用小库存和内容测试验证", "达标后再放量"],
  ["仅作标杆", "大盘规模高，但增速、门槛或复制性不适合直接进入", "用于学习价格、内容和产品定义", "不等于采购建议"],
];
guideSheet.getRange("A16:D19").format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
guideSheet.getRange("A21:B21").values = [["顺序", "内容"]];
styleHeader(guideSheet.getRange("A21:B21"));
guideSheet.getRange("A22:B25").values = [
  [1, "结论：标杆爆品、高速增长品、类目机会、直播/短视频驱动"],
  [2, "选品池：GMV Top50 + 飙升榜去重，保留一套建议动作"],
  [3, "原始榜单：GMV、销量、广告消耗、飙升各Top50，保留客单价与TR审计列"],
  [4, "飞书简报：只保留本期判断与6–8个核心推荐；完整榜单仍在Excel"],
];
guideSheet.getRange("A22:B25").format = {
  font: { color: COLORS.gray900, size: 10 },
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
for (const [col, width] of Object.entries({ A: 150, B: 390, C: 500, D: 450 })) {
  guideSheet.getRange(`${col}1:${col}25`).format.columnWidthPx = width;
}
guideSheet.getRange("A4:D4").format.rowHeightPx = 32;
guideSheet.getRange("A5:D7").format.rowHeightPx = 60;
guideSheet.getRange("A10:D13").format.rowHeightPx = 50;
guideSheet.getRange("A16:D19").format.rowHeightPx = 52;
guideSheet.freezePanes.freezeRows(4);

// Images
poolRows.forEach(({ row }, index) => {
  if (row.image_url) {
    imagePlacements.push({ sheet: poolSheet, row: poolFirst + index - 1, col: 2, url: row.image_url });
  }
});

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursorIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursorIndex;
        cursorIndex += 1;
        if (index >= items.length) break;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

async function thumbnail(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    const resized = await sharp(input)
      .rotate()
      .flatten({ background: "#FFFFFF" })
      .resize(54, 54, { fit: "contain", background: "#FFFFFF", withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

const uniqueUrls = [...new Set(imagePlacements.map((item) => item.url).filter(Boolean))];
const imageResults = await mapLimit(uniqueUrls, 14, async (url) => [url, await thumbnail(url)]);
const imageMap = new Map(imageResults);
let embeddedImages = 0;
for (const placement of imagePlacements) {
  const dataUrl = imageMap.get(placement.url);
  if (!dataUrl) continue;
  placement.sheet.images.add({
    dataUrl,
    anchor: {
      from: { row: placement.row, col: placement.col },
      extent: { widthPx: 54, heightPx: 54 },
    },
  });
  embeddedImages += 1;
}

const inspection = await workbook.inspect({
  kind: "region",
  sheetId: "结论",
  range: `A1:N${Math.min(caveatRow + 1, 40)}`,
  maxChars: 5000,
  tableMaxRows: 40,
  tableMaxCols: 14,
});
console.log(inspection.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const previewSpecs = [
  ["结论", `A1:N${Math.min(caveatRow + 1, 40)}`, "conclusion.png", 0.9],
  ["选品池", `A1:Q${Math.min(poolLast, 14)}`, "pool.png", 0.9],
  ["Top50原始榜单", `A1:AI${Math.min(rawLast, 14)}`, "raw.png", 0.75],
  ["使用说明", "A1:D25", "guide.png", 0.9],
];
for (const [sheetName, range, filename, scale] of previewSpecs) {
  const blob = await workbook.render({ sheetName, range, scale, format: "png" });
  await fs.writeFile(
    path.join(previewDir, filename),
    new Uint8Array(await blob.arrayBuffer()),
  );
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(output);

console.log(JSON.stringify({
  output,
  raw_rows: rawRows.length,
  pool_rows: poolRows.length,
  recommendations: allRecommendations.length,
  unique_images: uniqueUrls.length,
  embedded_images: embeddedImages,
  preview_dir: previewDir,
}));

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
    title: "高速增长｜优先关注",
    name: "GrowthProducts",
    items: (spec.recommendations?.growth || []).slice(0, 10),
    prefix: "高增",
  },
];
const allRecommendations = recommendationGroups.flatMap((group) => group.items);
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
setTitle(rawSheet, "A1:AF1", `${spec.meta.country} · ${spec.meta.category} · Top 50 原始榜单`);
setSubtitle(
  rawSheet,
  "A2:AF2",
  `${spec.meta.period_start} 至 ${spec.meta.period_end}｜数据保留网页区间｜来源：${spec.meta.source_url}`,
);
const rawHeaders = [
  "榜单", "Rank", "Product Name", "Product ID", "一级类目", "二级类目", "三级类目",
  "GMV区间", "GMV变化", "直播GMV区间", "短视频GMV区间", "商品卡GMV区间",
  "订单量区间", "平均价格", "广告消耗区间", "退款率区间", "店铺", "图片URL",
  "匹配质量", "开始日期", "结束日期", "来源页面", "GMV中点（辅助）",
  "直播GMV中点（辅助）", "短视频GMV中点（辅助）", "商品卡GMV中点（辅助）",
  "上期GMV估算（辅助）", "可比GMV中点（辅助）", "直播占比（估）",
  "短视频占比（估）", "商品卡占比（估）", "主要驱动",
];
rawSheet.getRange("A4:AF4").values = [rawHeaders];
styleHeader(rawSheet.getRange("A4:AF4"));
const rawFirst = 5;
const rawLast = rawFirst + rawRows.length - 1;
const rawValues = rawRows.map(({ banner, row }) => {
  const total = metric(row.gmv_total);
  const live = metric(row.gmv_live);
  const video = metric(row.gmv_video);
  const card = metric(row.gmv_product_card);
  const orders = metric(row.order_volume);
  const price = metric(row.avg_price);
  return [
    banner, row.rank, row.product_name, null, row.category_l1, row.category_l2, row.category_l3,
    total.range, total.change, live.range, video.range, card.range, orders.range, price.mid,
    metric(row.ads_cost).range, metric(row.refund_rate).range, row.shop_name, row.image_url,
    row.join_quality || "", spec.meta.period_start, spec.meta.period_end, spec.meta.source_url,
    total.mid, live.mid, video.mid, card.mid, total.prior, total.prior != null ? total.mid : null,
    null, null, null, null,
  ];
});
rawSheet.getRange(`A${rawFirst}:AF${rawLast}`).values = rawValues;
rawSheet.getRange(`D${rawFirst}:D${rawLast}`).formulas =
  rawRows.map(({ row }) => [asTextFormula(row.product_id)]);
rawSheet.getRange(`AC${rawFirst}:AC${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-5]/RC[-6],"")']);
rawSheet.getRange(`AD${rawFirst}:AD${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-5]/RC[-7],"")']);
rawSheet.getRange(`AE${rawFirst}:AE${rawLast}`).formulasR1C1 =
  rawRows.map(() => ['=IFERROR(RC[-5]/RC[-8],"")']);
rawSheet.getRange(`AF${rawFirst}:AF${rawLast}`).formulasR1C1 =
  rawRows.map(() => [
    '=IF(AND(RC[-3]>=0.5,RC[-3]>RC[-2]),"直播驱动",IF(AND(RC[-2]>=0.5,RC[-2]>RC[-3]),"短视频驱动","混合/其他"))',
  ]);
const rawTable = rawSheet.tables.add(`A4:AF${rawLast}`, true, "GcrmTop50Raw");
rawTable.style = "TableStyleLight1";
rawTable.showBandedRows = false;
rawTable.showFilterButton = true;
styleHeader(rawSheet.getRange("A4:AF4"));
rawSheet.getRange(`A${rawFirst}:AF${rawLast}`).format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
rawSheet.getRange(`D${rawFirst}:D${rawLast}`).format.numberFormat = "@";
rawSheet.getRange(`I${rawFirst}:I${rawLast}`).format.numberFormat = "0.0%";
rawSheet.getRange(`N${rawFirst}:N${rawLast}`).format.numberFormat = '"$"#,##0.00';
rawSheet.getRange(`W${rawFirst}:AB${rawLast}`).format.numberFormat = '"$"#,##0';
rawSheet.getRange(`AC${rawFirst}:AE${rawLast}`).format.numberFormat = "0.0%";
addChangeFont(rawSheet, `I${rawFirst}:I${rawLast}`, `I${rawFirst}`);
const rawWidths = {
  A: 100, B: 48, C: 330, D: 155, E: 110, F: 150, G: 160, H: 90, I: 75,
  J: 105, K: 115, L: 115, M: 95, N: 80, O: 105, P: 90, Q: 130, R: 230,
  S: 115, T: 88, U: 88, V: 230, W: 100, X: 105, Y: 115, Z: 115, AA: 110,
  AB: 115, AC: 88, AD: 98, AE: 100, AF: 88,
};
for (const [col, width] of Object.entries(rawWidths)) {
  rawSheet.getRange(`${col}1:${col}${rawLast}`).format.columnWidthPx = width;
}
rawSheet.getRange("A4:AF4").format.rowHeightPx = 34;
rawSheet.getRange(`A${rawFirst}:AF${rawLast}`).format.rowHeightPx = 26;
rawSheet.freezePanes.freezeRows(4);
rawSheet.freezePanes.freezeColumns(4);

const rawLocation = new Map();
rawRows.forEach(({ banner, row }, index) => {
  rawLocation.set(`${banner}|${String(row.product_id)}`, rawFirst + index);
});

// Selection pool
setTitle(poolSheet, "A1:X1", `${spec.meta.country} · ${spec.meta.category} · 选品池`);
setSubtitle(
  poolSheet,
  "A2:X2",
  `GMV Top 50 + 飙升 Top 50 去重｜${spec.meta.period_start} 至 ${spec.meta.period_end}｜商品名保持单行`,
);
const poolHeaders = [
  "机会标签", "来源榜单", "Rank", "图片", "Product Name", "Product ID", "二级类目",
  "三级类目", "GMV区间", "GMV变化", "直播占比（估）", "短视频占比（估）",
  "主要驱动", "建议级别", "订单量区间", "平均价格", "店铺", "匹配质量",
  "图片URL", "来源页面", "GMV中点（辅助）", "直播GMV中点（辅助）",
  "短视频GMV中点（辅助）", "上期GMV估算（辅助）",
];
poolSheet.getRange("A4:X4").values = [poolHeaders];
styleHeader(poolSheet.getRange("A4:X4"));
const poolFirst = 5;
const poolLast = poolFirst + poolRows.length - 1;
const poolValues = poolRows.map(({ banner, row }) => {
  const total = metric(row.gmv_total);
  return [
    null, banner, row.rank, "", row.product_name, null, row.category_l2, row.category_l3,
    total.range, total.change, null, null, null, null, metric(row.order_volume).range,
    metric(row.avg_price).mid, row.shop_name, row.join_quality || "", row.image_url,
    spec.meta.source_url, total.mid, metric(row.gmv_live).mid, metric(row.gmv_video).mid,
    total.prior,
  ];
});
poolSheet.getRange(`A${poolFirst}:X${poolLast}`).values = poolValues;
poolSheet.getRange(`A${poolFirst}:A${poolLast}`).formulasR1C1 = poolRows.map(() => [
  '=IF(AND(RC[1]="GMV Top 50",RC[2]<=10),"头部爆品",IF(AND(RC[9]>=0.4,RC[20]>=60000),"高速增长",IF(AND(RC[1]="飙升 Top 50",RC[9]>0),"新势能","观察")))',
]);
poolSheet.getRange(`F${poolFirst}:F${poolLast}`).formulas =
  poolRows.map(({ row }) => [asTextFormula(row.product_id)]);
poolSheet.getRange(`K${poolFirst}:K${poolLast}`).formulasR1C1 =
  poolRows.map(() => ['=IFERROR(RC[11]/RC[10],"")']);
poolSheet.getRange(`L${poolFirst}:L${poolLast}`).formulasR1C1 =
  poolRows.map(() => ['=IFERROR(RC[11]/RC[9],"")']);
poolSheet.getRange(`M${poolFirst}:M${poolLast}`).formulasR1C1 =
  poolRows.map(() => [
    '=IF(AND(RC[-2]>=0.5,RC[-2]>RC[-1]),"直播驱动",IF(AND(RC[-1]>=0.5,RC[-1]>RC[-2]),"短视频驱动","混合/其他"))',
  ]);
poolSheet.getRange(`N${poolFirst}:N${poolLast}`).formulasR1C1 =
  poolRows.map(() => [
    '=IF(RC[-13]="头部爆品","参考标杆",IF(OR(RC[-13]="高速增长",RC[-13]="新势能"),"优先关注","观察"))',
  ]);
const poolTable = poolSheet.tables.add(`A4:X${poolLast}`, true, "GcrmSelectionPool");
poolTable.style = "TableStyleLight1";
poolTable.showBandedRows = false;
poolTable.showFilterButton = true;
styleHeader(poolSheet.getRange("A4:X4"));
poolSheet.getRange(`A${poolFirst}:X${poolLast}`).format = {
  fill: COLORS.white,
  font: { color: COLORS.gray900, size: 9 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
poolSheet.getRange(`D${poolFirst}:D${poolLast}`).format.rowHeightPx = 58;
poolSheet.getRange(`F${poolFirst}:F${poolLast}`).format.numberFormat = "@";
poolSheet.getRange(`J${poolFirst}:L${poolLast}`).format.numberFormat = "0.0%";
poolSheet.getRange(`P${poolFirst}:P${poolLast}`).format.numberFormat = '"$"#,##0.00';
poolSheet.getRange(`U${poolFirst}:X${poolLast}`).format.numberFormat = '"$"#,##0';
addChangeFont(poolSheet, `J${poolFirst}:J${poolLast}`, `J${poolFirst}`);
poolSheet.getRange(`N${poolFirst}:N${poolLast}`).conditionalFormats.addCustom(
  `=N${poolFirst}="优先关注"`,
  { font: { color: COLORS.green, bold: true } },
);
const poolWidths = {
  A: 80, B: 100, C: 48, D: 62, E: 330, F: 155, G: 150, H: 160, I: 90, J: 72,
  K: 90, L: 100, M: 88, N: 82, O: 90, P: 80, Q: 130, R: 115, S: 220, T: 230,
  U: 100, V: 110, W: 118, X: 115,
};
for (const [col, width] of Object.entries(poolWidths)) {
  poolSheet.getRange(`${col}1:${col}${poolLast}`).format.columnWidthPx = width;
}
poolSheet.getRange("A4:X4").format.rowHeightPx = 34;
poolSheet.freezePanes.freezeRows(4);
poolSheet.freezePanes.freezeColumns(6);

// Conclusion
setTitle(conclusion, "A1:K1", `${spec.meta.country} ${spec.meta.category}选品报告`);
setSubtitle(
  conclusion,
  "A2:K2",
  `周期：${spec.meta.period_start} 至 ${spec.meta.period_end}｜Top 50｜绿色=增长，红色=下降｜定性判断标注“推测”`,
);
setSection(conclusion, "A4:K4", "本期怎么选");
const summaryBullets = (spec.summary_bullets || []).slice(0, 3);
while (summaryBullets.length < 3) summaryBullets.push("本期暂无补充结论。");
conclusion.getRange("A5:K7").values = summaryBullets.map((text, index) => [
  String(index + 1), text, null, null, null, null, null, null, null, null, null,
]);
for (const row of [5, 6, 7]) conclusion.getRange(`B${row}:K${row}`).merge();
conclusion.getRange("A5:K7").format = {
  font: { color: COLORS.gray900, size: 10 },
  verticalAlignment: "center",
  wrapText: false,
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
conclusion.getRange("A5:A7").format = {
  font: { color: COLORS.navy, bold: true, size: 11 },
  horizontalAlignment: "center",
};
conclusion.getRange("A5:K7").format.rowHeightPx = 28;

const imagePlacements = [];

function recommendationSourceRow(item) {
  const id = String(item.product_id);
  return rawLocation.get(`GMV Top 50|${id}`) || rawLocation.get(`飙升 Top 50|${id}`);
}

function writeRecommendationSection(startRow, group) {
  if (!group.items.length) return startRow - 1;
  setSection(conclusion, `A${startRow}:K${startRow}`, group.title);
  const headerRow = startRow + 1;
  const firstRow = startRow + 2;
  const lastRow = firstRow + group.items.length - 1;
  conclusion.getRange(`A${headerRow}:K${headerRow}`).values = [[
    "定位", "图片", "商品原型", "示例商品", "GMV区间", "增速", "直播占比",
    "短视频占比", "主要驱动", "建议", "为什么现在好卖",
  ]];
  styleHeader(conclusion.getRange(`A${headerRow}:K${headerRow}`));
  conclusion.getRange(`A${firstRow}:K${lastRow}`).values = group.items.map((item) => {
    const product = candidateById.get(String(item.product_id));
    return [
      `${group.prefix} #${product.rank}`, "", item.archetype, product.product_name,
      null, null, null, null, null, item.action, item.insight,
    ];
  });
  group.items.forEach((item, index) => {
    const sourceRow = recommendationSourceRow(item);
    const targetRow = firstRow + index;
    conclusion.getRange(`E${targetRow}:I${targetRow}`).formulas = [[
      safeSheetFormula("Top50原始榜单", `H${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `I${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AC${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AD${sourceRow}`),
      safeSheetFormula("Top50原始榜单", `AF${sourceRow}`),
    ]];
    const product = candidateById.get(String(item.product_id));
    if (product.image_url) {
      imagePlacements.push({ sheet: conclusion, row: targetRow - 1, col: 1, url: product.image_url });
    }
  });
  const table = conclusion.tables.add(`A${headerRow}:K${lastRow}`, true, group.name);
  table.style = "TableStyleLight1";
  table.showBandedRows = false;
  table.showFilterButton = false;
  styleHeader(conclusion.getRange(`A${headerRow}:K${headerRow}`));
  conclusion.getRange(`A${firstRow}:K${lastRow}`).format = {
    fill: COLORS.white,
    font: { color: COLORS.gray900, size: 9 },
    verticalAlignment: "center",
    wrapText: false,
    borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
  };
  conclusion.getRange(`K${firstRow}:K${lastRow}`).format.wrapText = true;
  conclusion.getRange(`F${firstRow}:H${lastRow}`).format.numberFormat = "0.0%";
  conclusion.getRange(`A${firstRow}:K${lastRow}`).format.rowHeightPx = 58;
  conclusion.getRange(`A${headerRow}:K${headerRow}`).format.rowHeightPx = 30;
  addChangeFont(conclusion, `F${firstRow}:F${lastRow}`, `F${firstRow}`);
  addActionFont(conclusion, `J${firstRow}:J${lastRow}`, `J${firstRow}`);
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

setSection(conclusion, `A${cursor}:K${cursor}`, "类目机会｜先看规模，再看增长");
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
    `=COUNTIFS(${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})`,
    `=SUMIFS(${rawColumnRange("W")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})`,
    `=COUNTIFS(${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row},${rawColumnRange("I")},">0")`,
    `=IFERROR(SUMIFS(${rawColumnRange("AB")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})/SUMIFS(${rawColumnRange("AA")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})-1,"")`,
    `=IFERROR(SUMIFS(${rawColumnRange("X")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})/SUMIFS(${rawColumnRange("W")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row}),"")`,
    `=IFERROR(SUMIFS(${rawColumnRange("Y")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row})/SUMIFS(${rawColumnRange("W")},${rawColumnRange("A")},"GMV Top 50",${rawColumnRange("F")},$A${row}),"")`,
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
conclusion.getRange(`A${caveatRow}:K${caveatRow + 1}`).merge();
conclusion.getRange(`A${caveatRow}:K${caveatRow + 1}`).values = [[
  "口径：GMV与渠道数据保留网页区间；直播/短视频占比由区间中点估算。类目增幅只使用有可比增速的商品反推上期规模。高增可能受新品、低基数、促销或季节影响；定性解释标注“推测”，不代表因果证明。",
]];
conclusion.getRange(`A${caveatRow}:K${caveatRow + 1}`).format = {
  font: { color: COLORS.gray500, size: 9 },
  wrapText: true,
  verticalAlignment: "center",
  borders: { top: { style: "thin", color: COLORS.gray300 } },
};
const conclusionWidths = {
  A: 180, B: 62, C: 150, D: 300, E: 92, F: 68, G: 82, H: 92, I: 86, J: 80, K: 430,
};
for (const [col, width] of Object.entries(conclusionWidths)) {
  conclusion.getRange(`${col}1:${col}${caveatRow + 1}`).format.columnWidthPx = width;
}
conclusion.getRange("A1:K1").format.rowHeightPx = 38;
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
guideSheet.getRange("A18:B18").values = [["顺序", "内容"]];
styleHeader(guideSheet.getRange("A18:B18"));
guideSheet.getRange("A19:B22").values = [
  [1, "结论：标杆爆品、高速增长品、类目机会、直播/短视频驱动"],
  [2, "选品池：GMV Top50 + 飙升榜去重，带图片"],
  [3, "原始榜单：GMV、销量、广告消耗、飙升各Top50"],
  [4, "口径：区间保留；渠道占比为区间中点估算"],
];
guideSheet.getRange("A19:B22").format = {
  font: { color: COLORS.gray900, size: 10 },
  borders: { insideHorizontal: { style: "thin", color: COLORS.gray200 } },
};
for (const [col, width] of Object.entries({ A: 150, B: 390, C: 500, D: 450 })) {
  guideSheet.getRange(`${col}1:${col}22`).format.columnWidthPx = width;
}
guideSheet.getRange("A4:D4").format.rowHeightPx = 32;
guideSheet.getRange("A5:D7").format.rowHeightPx = 60;
guideSheet.freezePanes.freezeRows(4);

// Images
poolRows.forEach(({ row }, index) => {
  if (row.image_url) {
    imagePlacements.push({ sheet: poolSheet, row: poolFirst + index - 1, col: 3, url: row.image_url });
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
  range: `A1:K${Math.min(caveatRow + 1, 40)}`,
  maxChars: 5000,
  tableMaxRows: 40,
  tableMaxCols: 11,
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
  ["结论", `A1:K${Math.min(caveatRow + 1, 40)}`, "conclusion.png", 0.9],
  ["选品池", `A1:N${Math.min(poolLast, 14)}`, "pool.png", 0.9],
  ["Top50原始榜单", `A1:P${Math.min(rawLast, 14)}`, "raw.png", 0.9],
  ["使用说明", "A1:D22", "guide.png", 0.9],
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

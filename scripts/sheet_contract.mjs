export const CORE_SHEET_NAMES = Object.freeze([
  "结论",
  "选品池",
  "Top50原始榜单",
  "使用说明",
]);

export const OPTIONAL_SHEET_NAMES = Object.freeze(["素材链接"]);

export const POOL_HEADERS = Object.freeze([
  "来源榜单", "Rank", "图片", "中文商品简称", "Product Name", "Product ID",
  "二级类目", "三级类目", "建议动作", "GMV区间", "GMV变化", "客单价（网页口径）",
  "广告消耗区间", "TR（估）", "直播占比（估）", "短视频占比（估）", "主要驱动",
  "订单量区间", "店铺", "匹配质量", "图片URL", "来源页面", "GMV中点（辅助）",
  "直播GMV中点（辅助）", "短视频GMV中点（辅助）", "广告消耗中点（辅助）",
  "交付序号", "推荐类型", "商品原型", "推荐理由与执行建议", "交付校验码",
]);

export const RAW_HEADERS = Object.freeze([
  "榜单", "Rank", "中文商品简称", "Product Name", "Product ID", "一级类目", "二级类目", "三级类目",
  "GMV区间", "GMV变化", "直播GMV区间", "短视频GMV区间", "商品卡GMV区间",
  "订单量区间", "平均价格", "广告消耗区间", "退款率区间", "店铺", "图片URL",
  "匹配质量", "开始日期", "结束日期", "来源页面", "GMV中点（辅助）",
  "直播GMV中点（辅助）", "短视频GMV中点（辅助）", "商品卡GMV中点（辅助）",
  "广告消耗中点（辅助）", "上期GMV估算（辅助）", "可比GMV中点（辅助）",
  "直播占比（估）", "短视频占比（估）", "商品卡占比（估）", "TR（估）", "主要驱动",
]);

export const CREATIVE_HEADERS = Object.freeze([
  "推荐序号", "推荐类型", "中文商品简称", "Product ID", "素材数量",
  "素材Rank", "素材Dollar Revenue", "素材URL", "覆盖状态", "素材周期",
]);

export const SHEET_CONTRACT = Object.freeze({
  schema_version: "1.0.0",
  core_sheets: CORE_SHEET_NAMES,
  optional_sheets: OPTIONAL_SHEET_NAMES,
  required_headers: {
    选品池: POOL_HEADERS,
    Top50原始榜单: RAW_HEADERS,
    素材链接: CREATIVE_HEADERS,
  },
  rules: [
    "一个单元格只承载一个指标；禁止把区间和变化率换行写在同一格",
    "核心子表必须全部存在；允许在其后追加合理的辅助子表",
    "执行过素材查询时必须有素材链接子表；无有效链接时保留0条状态",
    "允许在固定核心字段右侧追加辅助字段，但不得删除、合并或重命名核心字段",
  ],
});

function normalizeSheets(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { name: item, headers: [] };
    return {
      ...item,
      name: String(item?.name || item?.sheet_name || item?.title || ""),
      headers: Array.isArray(item?.headers) ? item.headers.map(String) : [],
    };
  });
}

function missingHeaders(actual, required) {
  const set = new Set(actual);
  return required.filter((header) => !set.has(header));
}

export function validateSheetDelivery(readback) {
  const errors = [];
  const mode = String(readback?.delivery_mode || "feishu");
  const sheetUrl = String(readback?.sheet_url || "").trim();
  const fallbackXlsx = String(readback?.fallback_xlsx || "").trim();
  if (mode === "feishu") {
    if (!/\/sheets\//.test(sheetUrl)) errors.push("sheet_url: a live Feishu/Lark Sheet URL is required");
  } else if (mode === "xlsx_fallback") {
    if (!fallbackXlsx) errors.push("fallback_xlsx: required in xlsx_fallback mode");
  } else {
    errors.push(`delivery_mode: unsupported value ${mode}`);
  }

  const sheets = normalizeSheets(readback?.sheets);
  const names = sheets.map((item) => item.name).filter(Boolean);
  if (new Set(names).size !== names.length) errors.push("sheets: duplicate sheet names");
  for (const required of CORE_SHEET_NAMES) {
    if (!names.includes(required)) errors.push(`sheets: missing core sheet ${required}`);
  }
  if (readback?.creative_query_performed && !names.includes("素材链接")) {
    errors.push("sheets: 素材链接 is required after a creative query");
  }

  for (const [sheetName, required] of Object.entries(SHEET_CONTRACT.required_headers)) {
    const sheet = sheets.find((item) => item.name === sheetName);
    if (!sheet) continue;
    if (!sheet.headers.length) {
      errors.push(`${sheetName}: headers are required in readback`);
      continue;
    }
    const duplicates = sheet.headers.filter((header, index) => sheet.headers.indexOf(header) !== index);
    if (duplicates.length) errors.push(`${sheetName}: duplicate headers ${[...new Set(duplicates)].join(", ")}`);
    const missing = missingHeaders(sheet.headers, required);
    if (missing.length) errors.push(`${sheetName}: missing headers ${missing.join(", ")}`);
    const multiline = sheet.headers.filter((header) => /[\r\n]/.test(header));
    if (multiline.length) errors.push(`${sheetName}: multiline headers are not allowed`);
  }

  const expectedRaw = Number(readback?.expected_raw_rows);
  const actualRaw = Number(readback?.actual_raw_rows);
  if (!Number.isInteger(expectedRaw) || expectedRaw < 1) {
    errors.push("expected_raw_rows: positive integer required");
  }
  if (!Number.isInteger(actualRaw) || actualRaw < 1) {
    errors.push("actual_raw_rows: positive integer required");
  }
  if (Number.isInteger(expectedRaw) && Number.isInteger(actualRaw) && expectedRaw !== actualRaw) {
    errors.push(`raw rows: expected ${expectedRaw}, got ${actualRaw}`);
  }
  if (Number(readback?.recommendation_rows) !== 8) {
    errors.push(`recommendation_rows: expected 8, got ${readback?.recommendation_rows ?? "missing"}`);
  }

  const compoundCells = Array.isArray(readback?.compound_metric_cells)
    ? readback.compound_metric_cells
    : [];
  if (compoundCells.length) {
    errors.push(`compound_metric_cells: expected 0, got ${compoundCells.length}`);
  }

  if (readback?.document_created && mode === "feishu") {
    const documentSheetUrl = String(readback?.document_sheet_url || "").trim();
    if (!documentSheetUrl) errors.push("document_sheet_url: required after document creation");
    if (documentSheetUrl && documentSheetUrl !== sheetUrl) {
      errors.push("document_sheet_url: must equal sheet_url");
    }
  }

  return {
    valid: errors.length === 0,
    delivery_mode: mode,
    sheet_url: sheetUrl || null,
    core_sheets: CORE_SHEET_NAMES,
    present_sheets: names,
    errors,
  };
}

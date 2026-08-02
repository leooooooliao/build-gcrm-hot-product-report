import fs from "node:fs/promises";
import path from "node:path";

const banners = ["GMV Top 50", "销量 Top 50", "广告消耗 Top 50", "飙升 Top 50"];
const allowedActions = new Set(["快速跟进", "条件跟进", "小单测试", "仅作标杆"]);

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    result[argv[index].slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return result;
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

function midpoint(value) {
  const [raw = ""] = String(value ?? "").split("\n");
  const clean = raw.trim();
  if (!clean) return null;
  if (clean.endsWith("+")) return numToken(clean.slice(0, -1));
  const parts = clean.split(/\s+-\s+/);
  if (parts.length === 2) {
    const lo = numToken(parts[0]);
    const hi = numToken(parts[1]);
    return lo != null && hi != null ? (lo + hi) / 2 : null;
  }
  return numToken(clean);
}

function productKey(row) {
  return String(row.product_id || `${row.shop_name || ""}|${row.product_name || ""}`);
}

const args = argsOf(process.argv.slice(2));
if (!args.input) {
  throw new Error("Usage: node validate_metrics.mjs --input report-spec.json");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const errors = [];
const allRows = [];

const categoryLevel = Number(spec.meta?.category_level);
const categoryLevelOne = String(spec.meta?.category_l1 || "").trim();
const categoryLevelTwo = String(spec.meta?.category_l2 || "").trim();
const categoryPath = String(spec.meta?.category_path || "").trim();
if (![1, 2].includes(categoryLevel)) {
  errors.push("meta.category_level: must be 1 or 2");
}
if (!categoryLevelOne) errors.push("meta.category_l1: required");
if (!categoryPath) errors.push("meta.category_path: required");
if (categoryLevel === 1) {
  if (categoryLevelTwo) errors.push("meta.category_l2: must be empty for a level-1 report");
  if (categoryPath && categoryPath !== categoryLevelOne) {
    errors.push("meta.category_path: must equal category_l1 for a level-1 report");
  }
}
if (categoryLevel === 2) {
  if (!categoryLevelTwo) errors.push("meta.category_l2: required for a level-2 report");
  const expectedPath = `${categoryLevelOne} > ${categoryLevelTwo}`;
  if (categoryPath && categoryPath !== expectedPath) {
    errors.push(`meta.category_path: expected ${expectedPath}`);
  }
}
if (categoryPath && spec.meta?.category !== categoryPath) {
  errors.push("meta.category: must equal meta.category_path");
}

for (const banner of banners) {
  const rows = spec.rankings?.[banner] || [];
  if (!Array.isArray(rows)) {
    errors.push(`${banner}: must be an array`);
    continue;
  }
  if (rows.length > 50) errors.push(`${banner}: ${rows.length} rows exceeds Top 50`);
  const ranks = rows.map((row) => Number(row.rank));
  if (new Set(ranks).size !== ranks.length) errors.push(`${banner}: duplicate ranks`);
  ranks.forEach((rank, index) => {
    if (rank !== index + 1) errors.push(`${banner}: expected rank ${index + 1}, got ${rank}`);
  });
  rows.forEach((row) => allRows.push({ banner, row }));
}

if (!(spec.rankings?.["GMV Top 50"] || []).length) {
  errors.push("GMV Top 50: at least one row is required");
}

for (const { banner, row } of allRows) {
  const key = productKey(row);
  const gmv = midpoint(row.gmv_total);
  const price = midpoint(row.avg_price);
  const ads = midpoint(row.ads_cost);
  if (!(gmv > 0)) errors.push(`${banner} rank ${row.rank} ${key}: missing or invalid gmv_total`);
  if (!(Number.isFinite(price) && price >= 0)) {
    errors.push(`${banner} rank ${row.rank} ${key}: missing or invalid avg_price`);
  }
  if (!(Number.isFinite(ads) && ads >= 0)) {
    errors.push(`${banner} rank ${row.rank} ${key}: missing or invalid ads_cost`);
  }
}

const candidateIds = new Set(
  [
    ...(spec.rankings?.["GMV Top 50"] || []),
    ...(spec.rankings?.["飙升 Top 50"] || []),
  ].filter((row) => row.product_id).map((row) => String(row.product_id)),
);
const rowsById = new Map(
  allRows
    .filter(({ row }) => row.product_id)
    .map(({ row }) => [String(row.product_id), row]),
);
const recommendations = [
  ...(spec.recommendations?.benchmarks || []),
  ...(spec.recommendations?.growth || []),
];
const recommendationIds = recommendations.map((item) => String(item.product_id || ""));
if (new Set(recommendationIds).size !== recommendationIds.length) {
  errors.push("recommendations: duplicate product_id values are not allowed");
}
if ((spec.recommendations?.benchmarks || []).length > 4) {
  errors.push("recommendations.benchmarks: maximum is 4");
}
if ((spec.recommendations?.growth || []).length > 10) {
  errors.push("recommendations.growth: maximum is 10");
}

for (const item of recommendations) {
  const id = String(item.product_id || "");
  if (!id) {
    errors.push("recommendation: product_id is required");
    continue;
  }
  if (!candidateIds.has(id)) errors.push(`recommendation ${id}: not in GMV Top 50 or 飙升 Top 50`);
  if (!allowedActions.has(item.action)) errors.push(`recommendation ${id}: invalid action ${item.action}`);
  const row = rowsById.get(id);
  if (!row) continue;
  const gmv = midpoint(row.gmv_total);
  const price = midpoint(row.avg_price);
  const ads = midpoint(row.ads_cost);
  const tr = gmv > 0 && Number.isFinite(ads) && ads >= 0 ? ads / gmv : null;
  if (!(Number.isFinite(price) && price >= 0)) errors.push(`recommendation ${id}: 客单价 is required`);
  if (!Number.isFinite(tr)) errors.push(`recommendation ${id}: TR cannot be calculated`);
}

if (!Array.isArray(spec.summary_bullets) || spec.summary_bullets.length !== 3) {
  errors.push("summary_bullets: exactly three concise conclusions are required");
}

const sample = recommendations.slice(0, 8).map((item) => {
  const row = rowsById.get(String(item.product_id));
  const gmv = midpoint(row?.gmv_total);
  const ads = midpoint(row?.ads_cost);
  return {
    product_id: String(item.product_id),
    average_price: midpoint(row?.avg_price),
    take_rate_estimate: gmv > 0 && Number.isFinite(ads) && ads >= 0
      ? Number((ads / gmv).toFixed(4))
      : null,
  };
});

const result = {
  valid: errors.length === 0,
  metric_contract: "TR（估）=广告消耗区间中点/总GMV区间中点；客单价直接取网页展示值",
  collected_rows: allRows.length,
  recommendations: recommendations.length,
  recommendation_metric_sample: sample,
  errors,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errors.length) process.exitCode = 1;

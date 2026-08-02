import fs from "node:fs/promises";
import path from "node:path";

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    result[argv[i].slice(2)] = argv[i + 1] ?? "";
    i += 1;
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

function metric(value) {
  const [range = "", changeRaw = ""] = String(value ?? "").split("\n");
  const clean = range.trim();
  let mid = null;
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
  const changeMatch = String(changeRaw).trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  return {
    range: clean,
    mid,
    change: changeMatch ? Number(changeMatch[1]) / 100 : null,
  };
}

function percentile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function rounded(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

const args = argsOf(process.argv.slice(2));
if (!args.input) {
  throw new Error("Usage: node score_candidates.mjs --input report.json [--output analysis-pack.json]");
}
const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const gmv = (spec.rankings?.["GMV Top 50"] || []).slice(0, 50);
const rising = (spec.rankings?.["飙升 Top 50"] || []).slice(0, 50);
if (!gmv.length) throw new Error("GMV Top 50 is required");

const risingIds = new Set(rising.map((row) => String(row.product_id)));
const rowsById = new Map();
for (const row of [...gmv, ...rising]) {
  const key = String(row.product_id || `${row.shop_name || ""}|${row.product_name || ""}`);
  if (!rowsById.has(key)) rowsById.set(key, row);
}

const enriched = [...rowsById.values()].map((row) => {
  const total = metric(row.gmv_total);
  const live = metric(row.gmv_live);
  const video = metric(row.gmv_video);
  const price = metric(row.avg_price);
  const ads = metric(row.ads_cost);
  const liveShare = total.mid && live.mid != null ? live.mid / total.mid : null;
  const videoShare = total.mid && video.mid != null ? video.mid / total.mid : null;
  const takeRate = total.mid && ads.mid != null ? ads.mid / total.mid : null;
  let driver = "混合/其他";
  if (liveShare >= 0.5 && liveShare > videoShare) driver = "直播驱动";
  if (videoShare >= 0.5 && videoShare > liveShare) driver = "短视频驱动";
  return {
    row,
    product_id: String(row.product_id || ""),
    total_mid: total.mid,
    change: total.change,
    live_share: liveShare,
    video_share: videoShare,
    driver,
    price_mid: price.mid,
    ads_mid: ads.mid,
    take_rate: takeRate,
    in_rising: risingIds.has(String(row.product_id)),
  };
});

const scaleValues = enriched.map((item) => item.total_mid);
const priceValues = enriched.map((item) => item.price_mid);
const scaleP25 = percentile(scaleValues, 0.25);
const scaleP50 = percentile(scaleValues, 0.5);
const scaleMax = Math.max(...scaleValues.filter(Number.isFinite), 1);
const priceP75 = percentile(priceValues, 0.75);

for (const item of enriched) {
  const scaleScore = Number.isFinite(item.total_mid)
    ? Math.log1p(item.total_mid) / Math.log1p(scaleMax)
    : 0;
  const growthScore = Number.isFinite(item.change) && item.change > 0
    ? Math.min(item.change, 3) / 3
    : 0;
  const channelScore = Math.max(item.live_share || 0, item.video_share || 0);
  const confirmed = item.row.join_quality === "product_id" || !item.row.join_quality;
  const lowBase = Number.isFinite(scaleP25) && item.total_mid < scaleP25;
  const extremeGrowth = Number.isFinite(item.change) && item.change > 3;
  const highTicket = Number.isFinite(priceP75) && item.price_mid >= priceP75;
  const uncertaintyPenalty = confirmed ? 0 : 0.25;
  const lowBasePenalty = lowBase && extremeGrowth ? 0.15 : 0;
  item.score =
    0.35 * growthScore
    + 0.30 * scaleScore
    + 0.20 * channelScore
    + (item.in_rising ? 0.15 : 0)
    - uncertaintyPenalty
    - lowBasePenalty;
  item.flags = [
    ...(lowBase ? ["low_base"] : []),
    ...(extremeGrowth ? ["extreme_growth"] : []),
    ...(highTicket ? ["high_ticket"] : []),
    ...(item.live_share >= 0.5 ? ["live_dependent"] : []),
    ...(item.video_share >= 0.5 ? ["video_native"] : []),
    ...(!confirmed ? ["uncertain_join"] : []),
  ];
}

const benchmarks = enriched
  .filter((item) => gmv.some((row) => row === item.row) && item.row.rank <= 10)
  .sort((a, b) => a.row.rank - b.row.rank)
  .slice(0, 8);

const growthCandidates = enriched
  .filter((item) => Number.isFinite(item.change) && item.change > 0)
  .sort((a, b) => b.score - a.score || (b.total_mid || 0) - (a.total_mid || 0))
  .slice(0, 20);

function publicItem(item) {
  return {
    product_id: item.product_id,
    rank: item.row.rank,
    product_name: item.row.product_name,
    category_l2: item.row.category_l2,
    category_l3: item.row.category_l3,
    gmv_range: metric(item.row.gmv_total).range,
    gmv_change: rounded(item.change),
    gmv_midpoint: rounded(item.total_mid, 0),
    average_price: rounded(item.price_mid, 2),
    ads_cost_range: metric(item.row.ads_cost).range,
    ads_cost_midpoint: rounded(item.ads_mid, 0),
    take_rate_estimate: rounded(item.take_rate),
    live_share: rounded(item.live_share),
    video_share: rounded(item.video_share),
    driver: item.driver,
    in_rising: item.in_rising,
    score: rounded(item.score),
    flags: item.flags,
    join_quality: item.row.join_quality || "product_id",
  };
}

const categories = new Map();
for (const row of gmv) {
  const category = row.category_l2 || "未分类";
  if (!categories.has(category)) {
    categories.set(category, {
      category_l2: category,
      product_count: 0,
      positive_count: 0,
      current_midpoint: 0,
      comparable_current: 0,
      comparable_prior: 0,
      live_midpoint: 0,
      video_midpoint: 0,
    });
  }
  const result = categories.get(category);
  const total = metric(row.gmv_total);
  const live = metric(row.gmv_live);
  const video = metric(row.gmv_video);
  result.product_count += 1;
  result.current_midpoint += total.mid || 0;
  result.live_midpoint += live.mid || 0;
  result.video_midpoint += video.mid || 0;
  if (total.change > 0) result.positive_count += 1;
  if (total.mid != null && total.change != null && total.change > -0.95) {
    result.comparable_current += total.mid;
    result.comparable_prior += total.mid / (1 + total.change);
  }
}

const categoryOpportunity = [...categories.values()]
  .map((item) => ({
    category_l2: item.category_l2,
    product_count: item.product_count,
    positive_count: item.positive_count,
    gmv_midpoint: rounded(item.current_midpoint, 0),
    estimated_growth: item.comparable_prior
      ? rounded(item.comparable_current / item.comparable_prior - 1)
      : null,
    live_share: item.current_midpoint
      ? rounded(item.live_midpoint / item.current_midpoint)
      : null,
    video_share: item.current_midpoint
      ? rounded(item.video_midpoint / item.current_midpoint)
      : null,
  }))
  .sort((a, b) => b.gmv_midpoint - a.gmv_midpoint);

const analysisPack = {
  meta: spec.meta,
  thresholds: {
    gmv_midpoint_p25: rounded(scaleP25, 0),
    gmv_midpoint_p50: rounded(scaleP50, 0),
    average_price_p75: rounded(priceP75, 2),
    extreme_growth: 3,
  },
  benchmark_candidates: benchmarks.map(publicItem),
  growth_candidates: growthCandidates.map(publicItem),
  category_opportunity: categoryOpportunity,
  interpretation_rules: {
    extreme_growth: "先检查低基数、新品或促销效应，不可直接等同于可持续趋势",
    uncertain_join: "只能作为候选证据，不能单独支撑快速跟进",
    low_base: "优先小单测试",
    live_dependent: "检查主播讲解、履约与售后能力",
    video_native: "优先验证视觉证明和UGC内容供给",
  },
};

const serialized = `${JSON.stringify(analysisPack, null, 2)}\n`;
if (args.output) {
  await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
  await fs.writeFile(path.resolve(args.output), serialized, "utf8");
}
process.stdout.write(serialized);

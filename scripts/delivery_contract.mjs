import crypto from "node:crypto";

export const DELIVERY_COUNTS = Object.freeze({ benchmarks: 2, growth: 6, total: 8 });

const allowedActions = new Set(["快速跟进", "条件跟进", "小单测试", "仅作标杆"]);
const growthActionPriority = new Map([
  ["快速跟进", 0],
  ["条件跟进", 1],
  ["小单测试", 2],
]);

function numToken(token) {
  const match = String(token ?? "")
    .replace(/,/g, "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const factor = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1;
  return Number(match[1]) * factor;
}

export function metric(value) {
  const [rangeRaw = "", changeRaw = ""] = String(value ?? "").split("\n");
  const range = rangeRaw.trim();
  let mid = null;
  if (range.endsWith("+")) {
    mid = numToken(range.slice(0, -1));
  } else {
    const parts = range.split(/\s+-\s+/);
    if (parts.length === 2) {
      const lo = numToken(parts[0]);
      const hi = numToken(parts[1]);
      if (lo != null && hi != null) mid = (lo + hi) / 2;
    } else {
      mid = numToken(range);
    }
  }
  const changeMatch = String(changeRaw).trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  return {
    range,
    mid,
    change: changeMatch ? Number(changeMatch[1]) / 100 : null,
  };
}

function rounded(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function canonicalSourceRows(spec) {
  const byId = new Map();
  for (const [sourceBanner, rows] of [
    ["GMV Top 50", spec.rankings?.["GMV Top 50"] || []],
    ["飙升 Top 50", spec.rankings?.["飙升 Top 50"] || []],
  ]) {
    for (const row of rows.slice(0, 50)) {
      const id = String(row.product_id || "");
      if (!id || byId.has(id)) continue;
      byId.set(id, { source_banner: sourceBanner, source_rank: Number(row.rank), source: row });
    }
  }
  return byId;
}

function enrichedRecommendation(spec, sourceById, item, group) {
  const productId = String(item.product_id || "");
  if (!productId) throw new Error(`${group}: recommendation product_id is required`);
  const canonical = sourceById.get(productId);
  if (!canonical) throw new Error(`${group} ${productId}: not in GMV Top 50 or 飙升 Top 50`);
  if (!allowedActions.has(item.action)) {
    throw new Error(`${group} ${productId}: invalid action ${item.action}`);
  }
  if (!String(item.archetype || "").trim()) {
    throw new Error(`${group} ${productId}: archetype is required`);
  }
  if (!String(item.insight || "").trim()) {
    throw new Error(`${group} ${productId}: insight is required`);
  }
  if (group === "标杆" && item.action !== "仅作标杆") {
    throw new Error(`标杆 ${productId}: action must be 仅作标杆`);
  }
  if (group === "增长" && item.action === "仅作标杆") {
    throw new Error(`增长 ${productId}: action cannot be 仅作标杆`);
  }
  if (group === "标杆" && (canonical.source_banner !== "GMV Top 50" || canonical.source_rank > 10)) {
    throw new Error(`标杆 ${productId}: must come from GMV Top 10`);
  }

  const total = metric(canonical.source.gmv_total);
  const live = metric(canonical.source.gmv_live);
  const video = metric(canonical.source.gmv_video);
  const price = metric(canonical.source.avg_price);
  const ads = metric(canonical.source.ads_cost);
  if (!(total.mid > 0)) throw new Error(`${group} ${productId}: total GMV is required`);
  if (!(Number.isFinite(price.mid) && price.mid >= 0)) {
    throw new Error(`${group} ${productId}: displayed average price is required`);
  }
  if (!(Number.isFinite(ads.mid) && ads.mid >= 0)) {
    throw new Error(`${group} ${productId}: ads cost is required`);
  }
  if (group === "增长" && !(Number.isFinite(total.change) && total.change > 0)) {
    throw new Error(`增长 ${productId}: canonical GMV change must be a real positive value`);
  }

  const liveShare = live.mid != null ? live.mid / total.mid : null;
  const videoShare = video.mid != null ? video.mid / total.mid : null;
  const takeRate = ads.mid / total.mid;
  const driver = liveShare >= 0.5 && liveShare > videoShare
    ? "直播驱动"
    : videoShare >= 0.5 && videoShare > liveShare
      ? "短视频驱动"
      : "混合/其他";
  const chineseName = String(spec.product_translations?.[productId] || "").trim();
  if (!chineseName) throw new Error(`${group} ${productId}: Chinese product name is required`);

  return {
    group,
    product_id: productId,
    source_banner: canonical.source_banner,
    source_rank: canonical.source_rank,
    chinese_name: chineseName,
    product_name: canonical.source.product_name,
    archetype: item.archetype,
    action: item.action,
    insight: item.insight,
    source: canonical.source,
    metrics: {
      gmv_range: total.range,
      gmv_change: rounded(total.change),
      gmv_midpoint: rounded(total.mid, 2),
      average_price: rounded(price.mid, 2),
      ads_cost_range: ads.range,
      ads_cost_midpoint: rounded(ads.mid, 2),
      take_rate_estimate: rounded(takeRate),
      live_share: rounded(liveShare),
      video_share: rounded(videoShare),
      driver,
    },
  };
}

function stableRecommendation(item) {
  return {
    position: item.position,
    group: item.group,
    product_id: item.product_id,
    source_banner: item.source_banner,
    source_rank: item.source_rank,
    chinese_name: item.chinese_name,
    archetype: item.archetype,
    action: item.action,
    insight: item.insight,
    gmv_range: item.metrics.gmv_range,
    gmv_change: item.metrics.gmv_change,
    average_price: item.metrics.average_price,
    take_rate_estimate: item.metrics.take_rate_estimate,
    live_share: item.metrics.live_share,
    video_share: item.metrics.video_share,
    driver: item.metrics.driver,
  };
}

export function buildDeliveryManifest(spec) {
  const benchmarks = spec.recommendations?.benchmarks || [];
  const growth = spec.recommendations?.growth || [];
  if (benchmarks.length !== DELIVERY_COUNTS.benchmarks) {
    throw new Error(`recommendations.benchmarks: exactly ${DELIVERY_COUNTS.benchmarks} required`);
  }
  if (growth.length !== DELIVERY_COUNTS.growth) {
    throw new Error(`recommendations.growth: exactly ${DELIVERY_COUNTS.growth} required`);
  }
  const ids = [...benchmarks, ...growth].map((item) => String(item.product_id || ""));
  if (new Set(ids).size !== DELIVERY_COUNTS.total) {
    throw new Error("recommendations: exactly 8 unique product_id values are required");
  }

  const sourceById = canonicalSourceRows(spec);
  const benchmarkItems = benchmarks
    .map((item) => enrichedRecommendation(spec, sourceById, item, "标杆"))
    .sort((a, b) => a.source_rank - b.source_rank || a.product_id.localeCompare(b.product_id));
  const growthItems = growth
    .map((item) => enrichedRecommendation(spec, sourceById, item, "增长"))
    .sort((a, b) =>
      b.metrics.gmv_midpoint - a.metrics.gmv_midpoint
      || b.metrics.gmv_change - a.metrics.gmv_change
      || growthActionPriority.get(a.action) - growthActionPriority.get(b.action)
      || a.source_rank - b.source_rank
      || a.product_id.localeCompare(b.product_id));
  const recommendations = [...benchmarkItems, ...growthItems].map((item, index) => ({
    ...item,
    position: index + 1,
  }));
  const fingerprintPayload = {
    market: spec.meta?.country,
    category_path: spec.meta?.category_path || spec.meta?.category,
    period_start: spec.meta?.period_start,
    period_end: spec.meta?.period_end,
    recommendations: recommendations.map(stableRecommendation),
  };
  const deliveryId = crypto
    .createHash("sha256")
    .update(JSON.stringify(fingerprintPayload))
    .digest("hex")
    .slice(0, 12);

  return {
    schema_version: "1.0.0",
    delivery_id: deliveryId,
    counts: DELIVERY_COUNTS,
    meta: {
      country: spec.meta?.country,
      category_path: spec.meta?.category_path || spec.meta?.category,
      category_level: Number(spec.meta?.category_level || 1),
      period_start: spec.meta?.period_start,
      period_end: spec.meta?.period_end,
      taxonomy_snapshot: spec.meta?.taxonomy_snapshot,
    },
    recommendation_ids: recommendations.map((item) => item.product_id),
    recommendations,
  };
}

function comparableReadback(record) {
  const percentDisplay = (value) => Number.isFinite(Number(value))
    ? Number(((Number(value) * 100).toFixed(1))) / 100
    : Number.NaN;
  const moneyDisplay = (value) => Number.isFinite(Number(value))
    ? Number(Number(value).toFixed(2))
    : Number.NaN;
  return {
    position: Number(record.position),
    group: String(record.group || ""),
    product_id: String(record.product_id || ""),
    source_banner: String(record.source_banner || ""),
    source_rank: Number(record.source_rank),
    chinese_name: String(record.chinese_name || ""),
    archetype: String(record.archetype || ""),
    action: String(record.action || ""),
    insight: String(record.insight || ""),
    gmv_range: String(record.gmv_range || ""),
    gmv_change: percentDisplay(record.gmv_change),
    average_price: moneyDisplay(record.average_price),
    take_rate_estimate: percentDisplay(record.take_rate_estimate),
    live_share: percentDisplay(record.live_share),
    video_share: percentDisplay(record.video_share),
    driver: String(record.driver || ""),
  };
}

export function expectedReadback(manifest) {
  return {
    delivery_id: manifest.delivery_id,
    recommendations: manifest.recommendations.map(stableRecommendation),
  };
}

export function reconcileDelivery(manifest, sheetReadback, briefReadback) {
  const expected = expectedReadback(manifest);
  const errors = [];
  for (const [name, readback] of [["sheet", sheetReadback], ["brief", briefReadback]]) {
    if (String(readback?.delivery_id || "") !== expected.delivery_id) {
      errors.push(`${name}: delivery_id mismatch`);
    }
    const rows = Array.isArray(readback?.recommendations) ? readback.recommendations : [];
    if (rows.length !== DELIVERY_COUNTS.total) {
      errors.push(`${name}: expected 8 recommendations, got ${rows.length}`);
      continue;
    }
    rows.forEach((row, index) => {
      const actual = comparableReadback(row);
      const wanted = comparableReadback(expected.recommendations[index]);
      for (const key of Object.keys(wanted)) {
        if (!Object.is(actual[key], wanted[key])) {
          errors.push(`${name}: position ${index + 1} ${key} mismatch; expected ${wanted[key]}, got ${actual[key]}`);
        }
      }
    });
  }
  return { valid: errors.length === 0, delivery_id: expected.delivery_id, errors };
}

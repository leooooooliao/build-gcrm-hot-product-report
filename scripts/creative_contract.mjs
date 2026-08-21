export const CREATIVE_DASHBOARD_URL =
  "https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187";

export const CREATIVE_QUERY_STATUSES = Object.freeze([
  "completed",
  "empty",
  "blocked",
]);

function normalizedIds(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((item, index) => item === right[index]);
}

export function validateCreativeLinks(record, recommendationIds) {
  const errors = [];
  const expectedIds = normalizedIds(recommendationIds);
  const requestedIds = normalizedIds(record?.meta?.requested_product_ids);
  const links = Array.isArray(record?.links) ? record.links : [];
  const status = String(record?.query_status || "").trim();

  if (record?.schema_version !== "1.1.0") {
    errors.push("schema_version: expected 1.1.0");
  }
  if (record?.attempted !== true) {
    errors.push("attempted: must be true; a skipped creative query is not a valid delivery state");
  }
  if (!CREATIVE_QUERY_STATUSES.includes(status)) {
    errors.push(`query_status: expected one of ${CREATIVE_QUERY_STATUSES.join(", ")}`);
  }
  if (!record?.attempted_at || !Number.isFinite(Date.parse(record.attempted_at))) {
    errors.push("attempted_at: valid ISO timestamp required");
  }
  if (String(record?.meta?.source_url || "").replace(/\/$/, "") !== CREATIVE_DASHBOARD_URL) {
    errors.push("meta.source_url: unexpected creative dashboard URL");
  }
  if (record?.meta?.filter_field !== "Ecommerce Product ID") {
    errors.push("meta.filter_field: must be Ecommerce Product ID, not Shop Name");
  }
  for (const field of ["period_start", "period_end"]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record?.meta?.[field] || ""))) {
      errors.push(`meta.${field}: YYYY-MM-DD required`);
    }
  }
  if (expectedIds.length !== 8 || new Set(expectedIds).size !== 8) {
    errors.push("recommendation_ids: expected eight unique manifest IDs");
  }
  if (!sameArray(requestedIds, expectedIds)) {
    errors.push("meta.requested_product_ids: must exactly match the eight manifest IDs in order");
  }
  if (!Array.isArray(record?.links)) {
    errors.push("links: array required");
  }

  const counts = Object.fromEntries(expectedIds.map((id) => [id, 0]));
  const seen = new Set();
  for (const [index, item] of links.entries()) {
    const productId = String(item?.product_id || "").trim();
    const url = String(item?.url || "").trim();
    const rank = Number(item?.creative_rank);
    if (!expectedIds.includes(productId)) {
      errors.push(`links[${index}].product_id: not in the recommendation manifest`);
    }
    if (!url || /^null$/i.test(url) || !/^https?:\/\//i.test(url)) {
      errors.push(`links[${index}].url: valid non-NULL http(s) URL required`);
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
      errors.push(`links[${index}].creative_rank: integer 1-5 required`);
    }
    const key = `${productId}\n${url}`;
    if (seen.has(key)) errors.push(`links[${index}]: duplicate product URL`);
    seen.add(key);
    if (Object.hasOwn(counts, productId)) counts[productId] += 1;
  }

  for (const [productId, count] of Object.entries(counts)) {
    if (count > 5) errors.push(`links: ${productId} has ${count} links; maximum is 5`);
    if (Number(record?.counts?.[productId]) !== count) {
      errors.push(`counts.${productId}: expected ${count}`);
    }
  }
  const countKeys = Object.keys(record?.counts || {}).sort();
  const expectedKeys = [...expectedIds].sort();
  if (!sameArray(countKeys, expectedKeys)) {
    errors.push("counts: keys must exactly match the eight requested Product IDs");
  }
  if (status === "completed" && links.length === 0) {
    errors.push("query_status: use empty when the completed query returned no valid links");
  }
  if (status === "empty" && links.length !== 0) {
    errors.push("query_status: empty requires zero valid links");
  }
  if (status === "blocked" && !String(record?.blocked_reason || "").trim()) {
    errors.push("blocked_reason: required when query_status is blocked");
  }
  if (status !== "blocked" && String(record?.blocked_reason || "").trim()) {
    errors.push("blocked_reason: only allowed when query_status is blocked");
  }

  return {
    valid: errors.length === 0,
    query_status: status || null,
    attempted: record?.attempted === true,
    requested_product_ids: requestedIds,
    link_count: links.length,
    products_with_links: Object.values(counts).filter((count) => count > 0).length,
    errors,
  };
}

export function assertCreativeLinks(record, recommendationIds) {
  const result = validateCreativeLinks(record, recommendationIds);
  if (!result.valid) {
    throw new Error(`Creative query contract failed:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}

export function emptyCreativeStatus(record) {
  if (record.query_status === "blocked") {
    return `查询受阻：${String(record.blocked_reason || "未知原因").trim()}`;
  }
  return "0条：看板查询完成但无有效非NULL素材，不补查";
}

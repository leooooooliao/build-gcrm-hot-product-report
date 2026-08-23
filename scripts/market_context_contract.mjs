export const MARKET_CONTEXT_STATUSES = Object.freeze([
  "completed",
  "empty",
  "unavailable",
  "blocked",
]);

export const MARKET_SIGNAL_TYPES = Object.freeze([
  "需求催化",
  "平台信号",
  "风险信号",
]);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function validateMarketContext(record) {
  const errors = [];
  const status = String(record?.status || "").trim();
  const signals = Array.isArray(record?.signals) ? record.signals : [];
  const queries = Array.isArray(record?.queries) ? record.queries : [];

  if (record?.schema_version !== "1.0.0") {
    errors.push("market_context.schema_version: expected 1.0.0");
  }
  if (typeof record?.search_available !== "boolean") {
    errors.push("market_context.search_available: boolean required");
  }
  if (typeof record?.attempted !== "boolean") {
    errors.push("market_context.attempted: boolean required");
  }
  if (!MARKET_CONTEXT_STATUSES.includes(status)) {
    errors.push(`market_context.status: expected one of ${MARKET_CONTEXT_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(record?.queries) || queries.length > 3) {
    errors.push("market_context.queries: array with at most 3 queries required");
  }
  if (!Array.isArray(record?.signals) || signals.length > 3) {
    errors.push("market_context.signals: array with at most 3 signals required");
  }
  if (record?.search_available === true && record?.attempted !== true) {
    errors.push("market_context.attempted: must be true when search is available");
  }
  if (record?.search_available === false && record?.attempted === true) {
    errors.push("market_context.attempted: cannot be true when search is unavailable");
  }
  if (record?.attempted === true) {
    if (!record?.attempted_at || !Number.isFinite(Date.parse(record.attempted_at))) {
      errors.push("market_context.attempted_at: valid ISO timestamp required after a search attempt");
    }
    if (queries.length < 1) {
      errors.push("market_context.queries: at least one query required after a search attempt");
    }
  }
  if (status === "unavailable" && record?.search_available !== false) {
    errors.push("market_context.status: unavailable requires search_available=false");
  }
  if (["completed", "empty", "blocked"].includes(status) && record?.search_available !== true) {
    errors.push(`market_context.status: ${status} requires search_available=true`);
  }
  if (status === "completed" && signals.length < 1) {
    errors.push("market_context.status: completed requires at least one retained signal");
  }
  if (status !== "completed" && signals.length !== 0) {
    errors.push(`market_context.status: ${status} requires zero retained signals`);
  }
  if (status === "blocked" && !String(record?.blocked_reason || "").trim()) {
    errors.push("market_context.blocked_reason: required when status is blocked");
  }
  if (status !== "blocked" && String(record?.blocked_reason || "").trim()) {
    errors.push("market_context.blocked_reason: only allowed when status is blocked");
  }

  signals.forEach((signal, index) => {
    if (!MARKET_SIGNAL_TYPES.includes(signal?.signal_type)) {
      errors.push(`market_context.signals[${index}].signal_type: invalid type`);
    }
    for (const field of ["title", "source_name", "what_changed", "why_it_matters", "merchant_action"]) {
      if (!String(signal?.[field] || "").trim()) {
        errors.push(`market_context.signals[${index}].${field}: required`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(signal?.date || ""))) {
      errors.push(`market_context.signals[${index}].date: YYYY-MM-DD required`);
    }
    if (!isHttpUrl(signal?.source_url)) {
      errors.push(`market_context.signals[${index}].source_url: valid HTTP(S) URL required`);
    }
    if (!Array.isArray(signal?.relevance_to) || signal.relevance_to.length < 1) {
      errors.push(`market_context.signals[${index}].relevance_to: non-empty array required`);
    }
    const score = Number(signal?.relevance_score);
    if (!Number.isInteger(score) || score < 4 || score > 6) {
      errors.push(`market_context.signals[${index}].relevance_score: integer 4-6 required`);
    }
    if (!["high", "medium"].includes(signal?.confidence)) {
      errors.push(`market_context.signals[${index}].confidence: high or medium required`);
    }
  });

  return {
    valid: errors.length === 0,
    status: status || null,
    signal_count: signals.length,
    errors,
  };
}

export function assertMarketContext(record) {
  const result = validateMarketContext(record);
  if (!result.valid) {
    throw new Error(`Market context contract failed:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}

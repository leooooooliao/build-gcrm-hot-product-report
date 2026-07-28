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

function productKey(row) {
  return String(row.product_id || `${row.shop_name || ""}|${row.product_name || ""}`);
}

function meaningfulUnits(title) {
  const matches = String(title || "").match(
    /\b\d+(?:\.\d+)?\s*(?:ml|fl\s*oz|oz|inch|in|lbs?|kg|g|w|v|mah)\b(?!\s*(?:hz|wi-?fi))/gi,
  ) || [];
  return [...new Set(matches.map((item) => item.replace(/\s+/g, "").toLowerCase()))];
}

const args = argsOf(process.argv.slice(2));
if (!args.input) {
  throw new Error("Usage: node validate_translations.mjs --input report.json");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const banners = ["GMV Top 50", "销量 Top 50", "广告消耗 Top 50", "飙升 Top 50"];
const rows = banners.flatMap((banner) => spec.rankings?.[banner] || []);
const unique = new Map();
for (const row of rows) {
  const key = productKey(row);
  if (!unique.has(key)) unique.set(key, row);
}

const translations = spec.product_translations || {};
const missing = [];
const invalid = [];
const warnings = [];
for (const [key, row] of unique) {
  const name = String(translations[key] || "").trim();
  if (!name) {
    missing.push({ product_key: key, product_name: row.product_name });
    continue;
  }
  const problems = [];
  if (!/[\u3400-\u9fff]/u.test(name)) problems.push("no_chinese_characters");
  if (name.length < 4) problems.push("too_short");
  if (name.length > 45) problems.push("too_long");
  if (/[\r\n]/.test(name)) problems.push("multiline");
  if (/#|https?:\/\//i.test(name)) problems.push("promotion_or_url");
  if (name.toLowerCase() === String(row.product_name || "").trim().toLowerCase()) {
    problems.push("same_as_source");
  }
  if (problems.length) {
    invalid.push({ product_key: key, chinese_name: name, problems });
  }
  const normalizedName = name.replace(/\s+/g, "").toLowerCase();
  const omittedUnits = meaningfulUnits(row.product_name)
    .filter((unit) => !normalizedName.includes(unit));
  if (omittedUnits.length) {
    warnings.push({
      product_key: key,
      chinese_name: name,
      omitted_meaningful_units: omittedUnits,
    });
  }
}

const result = {
  valid: missing.length === 0 && invalid.length === 0,
  unique_products: unique.size,
  translated_products: Object.keys(translations).length,
  missing_count: missing.length,
  invalid_count: invalid.length,
  warning_count: warnings.length,
  missing: missing.slice(0, 30),
  invalid: invalid.slice(0, 30),
  warnings: warnings.slice(0, 30),
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.valid ? 0 : 2;

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const options = JSON.parse(
  await fs.readFile(path.join(here, "..", "references", "filter-options.json"), "utf8"),
);

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    result[argv[i].slice(2)] = argv[i + 1] ?? "";
    i += 1;
  }
  return result;
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function groupedOptions(items, perLine = 5) {
  const lines = [];
  for (let index = 0; index < items.length; index += perLine) {
    lines.push(items.slice(index, index + perLine).join(" / "));
  }
  return lines.join("\n");
}

function levenshtein(a, b) {
  const left = [...normalize(a)];
  const right = [...normalize(b)];
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return row[right.length];
}

function nearestCategories(input) {
  const normalized = normalize(input);
  const special = normalized === "家居"
    ? ["家居用品", "家具", "家纺布艺"]
    : [];
  const ranked = options.level_1_categories
    .map((category) => {
      const target = normalize(category);
      const contains = target.includes(normalized) || normalized.includes(target);
      return { category, score: contains ? -10 : levenshtein(normalized, target) };
    })
    .sort((a, b) => a.score - b.score || a.category.localeCompare(b.category, "zh-CN"))
    .map((item) => item.category);
  return [...new Set([...special, ...ranked])].slice(0, 3);
}

function resolveCountry(input) {
  const raw = String(input ?? "").trim();
  const all = [...options.countries.top_level, ...options.countries.sea_children];
  const direct = all.find((item) => normalize(item) === normalize(raw));
  if (direct) return { status: "valid", canonical: direct };
  const alias = Object.entries(options.country_aliases)
    .find(([key]) => normalize(key) === normalize(raw));
  if (alias) return { status: "confirm_required", canonical: alias[1] };
  return { status: "invalid", candidates: all.slice(0, 9) };
}

function resolveCategory(input) {
  const raw = String(input ?? "").trim();
  const direct = options.level_1_categories
    .find((item) => normalize(item) === normalize(raw));
  if (direct) return { status: "valid", canonical: direct };
  const alias = Object.entries(options.category_aliases)
    .find(([key]) => normalize(key) === normalize(raw));
  if (alias) {
    return {
      status: "confirm_required",
      canonical: alias[1],
      candidates: [alias[1]],
    };
  }
  return { status: "invalid", candidates: nearestCategories(raw) };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const args = argsOf(process.argv.slice(2));
const categoryOptionsText = groupedOptions(options.level_1_categories);
if (Object.prototype.hasOwnProperty.call(args, "list-options")) {
  console.log(JSON.stringify({
    taxonomy_name: options.taxonomy_name,
    taxonomy_snapshot: options.taxonomy_snapshot,
    source_verified_at: options.source_verified_at,
    country_options: options.countries.top_level,
    sea_country_options: options.countries.sea_children,
    category_count: options.level_1_categories.length,
    category_options: options.level_1_categories,
    category_options_text: categoryOptionsText,
  }, null, 2));
  process.exit(0);
}

const country = resolveCountry(args.country);
const category = resolveCategory(args.category);
const datesValid = validDate(args.start)
  && validDate(args.end)
  && args.start <= args.end;

const valid = country.status === "valid" && category.status === "valid" && datesValid;
const needsConfirmation =
  country.status === "confirm_required" || category.status === "confirm_required";

const messages = [
  `本报告使用 ${options.taxonomy_name} 当前版本（快照 ${options.taxonomy_snapshot}）。`,
];

if (country.status === "invalid") {
  messages.push(`国家无效。可选：${options.countries.top_level.join(" / ")}；SEA 子国家：${options.countries.sea_children.join(" / ")}。`);
} else if (country.status === "confirm_required") {
  messages.push(`国家输入“${args.country}”将映射为“${country.canonical}”，请确认。`);
} else if (country.canonical === "SEA") {
  messages.push(`请确认使用 SEA 汇总，还是具体国家：${options.countries.sea_children.join(" / ")}。`);
}

if (category.status === "invalid" && !String(args.category ?? "").trim()) {
  messages.push(`请选择一个准确的一级类目（共 ${options.level_1_categories.length} 个）：\n${categoryOptionsText}`);
} else if (category.status === "invalid") {
  messages.push(`类目“${args.category}”不在当前版本中。最接近：${category.candidates.join(" / ")}。`);
  messages.push(`当前完整一级类目（共 ${options.level_1_categories.length} 个）：\n${categoryOptionsText}`);
} else if (category.status === "confirm_required") {
  messages.push(`类目输入“${args.category}”将映射为平台标签“${category.canonical}”，请确认。`);
}

if (!datesValid) {
  messages.push("时间周期必须是有效的 YYYY-MM-DD 起止日期，且开始日期不得晚于结束日期。");
}

if (valid) {
  messages.push(`已确认：${country.canonical} × ${category.canonical} × ${args.start} 至 ${args.end}。`);
}

console.log(JSON.stringify({
  valid,
  needs_confirmation: needsConfirmation,
  taxonomy_name: options.taxonomy_name,
  taxonomy_snapshot: options.taxonomy_snapshot,
  source_verified_at: options.source_verified_at,
  category_count: options.level_1_categories.length,
  country,
  category,
  period: { start: args.start ?? "", end: args.end ?? "", valid: datesValid },
  message: messages.join("\n"),
}, null, 2));

process.exitCode = valid ? 0 : 2;

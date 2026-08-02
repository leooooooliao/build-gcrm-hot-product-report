import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const options = JSON.parse(
  await fs.readFile(path.join(here, "..", "references", "filter-options.json"), "utf8"),
);

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
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
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return row[right.length];
}

const levelTwoPaths = Object.entries(options.category_hierarchy)
  .flatMap(([levelOne, children]) => children.map((levelTwo) => ({
    level: 2,
    level_1: levelOne,
    level_2: levelTwo,
    path: `${levelOne} > ${levelTwo}`,
  })));

function categoryCandidateScore(input, label) {
  const normalizedInput = normalize(input);
  const normalizedLabel = normalize(label);
  const contains = normalizedInput
    && (normalizedLabel.includes(normalizedInput) || normalizedInput.includes(normalizedLabel));
  return contains ? -10 : levenshtein(normalizedInput, normalizedLabel);
}

function nearestCategories(input) {
  const special = normalize(input) === "家居"
    ? ["家居用品", "家具", "家纺布艺"]
    : [];
  const candidates = [
    ...options.level_1_categories.map((label) => ({
      level: 1,
      label,
      path: label,
      score: categoryCandidateScore(input, label),
    })),
    ...levelTwoPaths.map((item) => ({
      level: 2,
      label: item.level_2,
      path: item.path,
      score: categoryCandidateScore(input, item.level_2),
    })),
  ].sort((left, right) => left.score - right.score
    || left.path.localeCompare(right.path, "zh-CN"));

  const preferred = special.map((label) => ({
    level: 1,
    label,
    path: label,
    score: -20,
  }));
  const unique = new Map();
  for (const candidate of [...preferred, ...candidates]) {
    if (!unique.has(candidate.path)) unique.set(candidate.path, candidate);
  }
  return [...unique.values()].slice(0, 3);
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

function parseBreadcrumb(raw) {
  const parts = String(raw ?? "").split(/[>＞]/).map((item) => item.trim()).filter(Boolean);
  return parts.length === 2 ? parts : null;
}

function validLevelTwo(levelOne, levelTwo) {
  const canonicalLevelOne = options.level_1_categories
    .find((item) => normalize(item) === normalize(levelOne));
  if (!canonicalLevelOne) return null;
  const canonicalLevelTwo = options.category_hierarchy[canonicalLevelOne]
    .find((item) => normalize(item) === normalize(levelTwo));
  if (!canonicalLevelTwo) return null;
  return {
    status: "valid",
    level: 2,
    canonical: canonicalLevelTwo,
    level_1: canonicalLevelOne,
    level_2: canonicalLevelTwo,
    path: `${canonicalLevelOne} > ${canonicalLevelTwo}`,
  };
}

function resolveCategory(input) {
  const raw = String(input ?? "").trim();
  const directLevelOne = options.level_1_categories
    .find((item) => normalize(item) === normalize(raw));
  if (directLevelOne) {
    return {
      status: "valid",
      level: 1,
      canonical: directLevelOne,
      level_1: directLevelOne,
      level_2: null,
      path: directLevelOne,
    };
  }

  const breadcrumb = parseBreadcrumb(raw);
  if (breadcrumb) {
    const resolved = validLevelTwo(breadcrumb[0], breadcrumb[1]);
    if (resolved) return resolved;
  }

  const directLevelTwo = levelTwoPaths
    .filter((item) => normalize(item.level_2) === normalize(raw));
  if (directLevelTwo.length === 1) {
    const [match] = directLevelTwo;
    return {
      status: "confirm_required",
      reason: "level_2_match",
      level: 2,
      canonical: match.level_2,
      level_1: match.level_1,
      level_2: match.level_2,
      path: match.path,
      candidates: [match.path],
    };
  }
  if (directLevelTwo.length > 1) {
    return {
      status: "confirm_required",
      reason: "ambiguous_level_2",
      level: 2,
      canonical: null,
      level_1: null,
      level_2: raw,
      path: null,
      candidates: directLevelTwo.map((item) => item.path),
    };
  }

  const alias = Object.entries(options.category_aliases)
    .find(([key]) => normalize(key) === normalize(raw));
  if (alias) {
    return {
      status: "confirm_required",
      reason: "level_1_alias",
      level: 1,
      canonical: alias[1],
      level_1: alias[1],
      level_2: null,
      path: alias[1],
      candidates: [alias[1]],
    };
  }

  return {
    status: "invalid",
    level: null,
    canonical: null,
    level_1: null,
    level_2: null,
    path: null,
    candidates: nearestCategories(raw),
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const args = argsOf(process.argv.slice(2));
const categoryOptionsText = groupedOptions(options.level_1_categories);
const taxonomyReminder = `类目需对照营销参谋 GCRM Top Product 当前版本的一级/二级类目（快照 ${options.taxonomy_snapshot}）。`;

if (Object.prototype.hasOwnProperty.call(args, "list-options")) {
  console.log(JSON.stringify({
    taxonomy_name: options.taxonomy_name,
    taxonomy_snapshot: options.taxonomy_snapshot,
    source_verified_at: options.source_verified_at,
    taxonomy_reminder: taxonomyReminder,
    country_options: options.countries.top_level,
    sea_country_options: options.countries.sea_children,
    level_1_category_count: options.level_1_categories.length,
    level_2_category_path_count: levelTwoPaths.length,
    category_options: options.level_1_categories,
    category_options_text: categoryOptionsText,
  }, null, 2));
  process.exit(0);
}

if (Object.prototype.hasOwnProperty.call(args, "list-children")) {
  const requested = String(args["list-children"] ?? "").trim();
  const levelOne = options.level_1_categories
    .find((item) => normalize(item) === normalize(requested));
  if (!levelOne) {
    console.error(`一级类目不在当前版本中：${requested}`);
    process.exit(2);
  }
  console.log(JSON.stringify({
    taxonomy_name: options.taxonomy_name,
    taxonomy_snapshot: options.taxonomy_snapshot,
    level_1: levelOne,
    level_2_count: options.category_hierarchy[levelOne].length,
    level_2_options: options.category_hierarchy[levelOne],
  }, null, 2));
  process.exit(0);
}

const country = resolveCountry(args.country);
const category = resolveCategory(args.category);
const datesValid = validDate(args.start)
  && validDate(args.end)
  && args.start <= args.end;

const valid = country.status === "valid" && category.status === "valid" && datesValid;
const needsConfirmation = country.status === "confirm_required"
  || category.status === "confirm_required";
const messages = [taxonomyReminder];

if (country.status === "invalid") {
  messages.push(`国家无效。可选：${options.countries.top_level.join(" / ")}；SEA 子国家：${options.countries.sea_children.join(" / ")}。`);
} else if (country.status === "confirm_required") {
  messages.push(`国家输入“${args.country}”将映射为“${country.canonical}”，请确认。`);
} else if (country.canonical === "SEA") {
  messages.push(`请确认使用 SEA 汇总，还是具体国家：${options.countries.sea_children.join(" / ")}。`);
}

if (category.status === "invalid" && !String(args.category ?? "").trim()) {
  messages.push(`请选择一个一级类目，或直接输入更精准的二级类目。当前完整一级类目（共 ${options.level_1_categories.length} 个）：\n${categoryOptionsText}`);
} else if (category.status === "invalid") {
  messages.push(`类目“${args.category}”不在当前版本的一、二级类目中。最接近：${category.candidates.map((item) => item.path).join(" / ")}。`);
  messages.push(`当前完整一级类目（共 ${options.level_1_categories.length} 个）：\n${categoryOptionsText}`);
} else if (category.status === "confirm_required" && category.reason === "level_2_match") {
  messages.push(`你输入的“${args.category}”不是一级类目；当前二级类目中匹配到“${category.path}”。请确认是否按这个二级类目执行。`);
} else if (category.status === "confirm_required" && category.reason === "ambiguous_level_2") {
  messages.push(`二级类目“${args.category}”存在多个路径：${category.candidates.join(" / ")}。请回复一个完整路径。`);
} else if (category.status === "confirm_required") {
  messages.push(`类目输入“${args.category}”将映射为一级类目“${category.path}”，请确认。`);
}

if (!datesValid) {
  messages.push("时间周期必须是有效的 YYYY-MM-DD 起止日期，且开始日期不得晚于结束日期。");
}

if (valid) {
  messages.push(`已确认：${country.canonical} × ${category.path} × ${args.start} 至 ${args.end}。`);
}

console.log(JSON.stringify({
  valid,
  needs_confirmation: needsConfirmation,
  taxonomy_name: options.taxonomy_name,
  taxonomy_snapshot: options.taxonomy_snapshot,
  source_verified_at: options.source_verified_at,
  level_1_category_count: options.level_1_categories.length,
  level_2_category_path_count: levelTwoPaths.length,
  category_options: options.level_1_categories,
  category_options_text: categoryOptionsText,
  country,
  category,
  period: { start: args.start ?? "", end: args.end ?? "", valid: datesValid },
  message: messages.join("\n"),
}, null, 2));

process.exitCode = valid ? 0 : 2;

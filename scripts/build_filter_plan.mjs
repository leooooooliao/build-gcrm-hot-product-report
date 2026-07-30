#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const options = JSON.parse(
  await fs.readFile(
    path.join(here, "..", "references", "filter-options.json"),
    "utf8",
  ),
);

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${token} 缺少值。`);
    }
    result[token.slice(2)] = value.trim();
    index += 1;
  }
  return result;
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cssString(value) {
  return `"${String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\A ")}"`;
}

function resolveExactOrAlias(input, values, aliases, label) {
  const exact = values.find((value) => normalize(value) === normalize(input));
  if (exact) return exact;
  const alias = Object.entries(aliases)
    .find(([key]) => normalize(key) === normalize(input));
  if (alias && values.includes(alias[1])) return alias[1];
  throw new Error(`${label}不在当前筛选版本中：${input}`);
}

function main() {
  const args = argsOf(process.argv.slice(2));
  if (!args.country || !args.category) {
    throw new Error(
      "Usage: node scripts/build_filter_plan.mjs --country <COUNTRY> --category <精确一级类目>",
    );
  }

  const countries = [
    ...options.countries.top_level,
    ...options.countries.sea_children,
  ];
  const country = resolveExactOrAlias(
    args.country,
    countries,
    options.country_aliases,
    "国家",
  );
  const category = resolveExactOrAlias(
    args.category,
    options.level_1_categories,
    options.category_aliases,
    "一级类目",
  );

  const directUrl = new URL(options.source_page);
  directUrl.searchParams.set("region", country);

  const visibleCountryDropdown =
    ".potoo-marketing-advisor-tree-select-dropdown:not(.potoo-marketing-advisor-select-dropdown-hidden)";
  const countryOption = [
    visibleCountryDropdown,
    " .potoo-marketing-advisor-select-tree-node-content-wrapper",
    `[title=${cssString(country)}]`,
  ].join("");
  const seaParentNode = [
    visibleCountryDropdown,
    " .potoo-marketing-advisor-select-tree-treenode",
    ":has(> .potoo-marketing-advisor-select-tree-node-content-wrapper[title=\"SEA\"])",
  ].join("");

  const visibleCategoryDropdown =
    ".potoo-marketing-advisor-cascader-dropdown:not(.potoo-marketing-advisor-select-dropdown-hidden)";
  const levelOneMenu = [
    visibleCategoryDropdown,
    " .potoo-marketing-advisor-cascader-menus",
    " > .potoo-marketing-advisor-cascader-menu:first-of-type",
  ].join("");
  const categoryRow = [
    levelOneMenu,
    " li[role=\"menuitemcheckbox\"]",
    `[title=${cssString(category)}]`,
  ].join("");

  const plan = {
    schema_version: "1.0.0",
    generated_from: "references/filter-options.json",
    taxonomy_snapshot: options.taxonomy_snapshot,
    page_url: options.source_page,
    country,
    category,
    manual_filter_selection_required: false,
    operation_order: [
      "navigate_country_url",
      "verify_country",
      "select_one_level_1_category",
      "set_exact_dates",
      "save_and_wait",
      "verify_filters_and_numeric_rows",
    ],
    country_selection: {
      preferred_path: "direct_url",
      direct_url: directUrl.toString(),
      ordering_note:
        "Set country first because changing region may reset category and dates.",
      trigger_selector: ".potoo-marketing-advisor-tree-select",
      visible_dropdown_selector: visibleCountryDropdown,
      option_selector: countryOption,
      is_sea_child: options.countries.sea_children.includes(country),
      sea_expand_selector:
        `${seaParentNode} > .potoo-marketing-advisor-select-tree-switcher`,
      selected_value_selector:
        ".potoo-marketing-advisor-tree-select .potoo-marketing-advisor-select-selection-item",
      offscreen_strategy:
        "Use an exact DOM locator so the browser auto-scrolls inside the open tree overlay. If unavailable, scroll only inside visible_dropdown_selector.",
    },
    category_selection: {
      trigger_selector:
        ".potoo-marketing-advisor-cascader > .potoo-marketing-advisor-select-selector",
      visible_dropdown_selector: visibleCategoryDropdown,
      level_one_menu_selector: levelOneMenu,
      checked_level_one_selector:
        `${levelOneMenu} li[role="menuitemcheckbox"][aria-checked="true"]`,
      target_row_selector: categoryRow,
      target_checked_selector: `${categoryRow}[aria-checked="true"]`,
      target_checkbox_selector:
        `${categoryRow} .potoo-marketing-advisor-cascader-checkbox`,
      target_checkbox_fallback_selector:
        `${visibleCategoryDropdown} li[role="menuitemcheckbox"][title=${cssString(category)}] .potoo-marketing-advisor-cascader-checkbox`,
      selected_value_selector:
        ".potoo-marketing-advisor-cascader .potoo-marketing-advisor-select-selection-item-content",
      overflow_marker_selector:
        ".potoo-marketing-advisor-cascader .potoo-marketing-advisor-select-selection-overflow-item-rest",
      selection_strategy:
        "Clear checked level-1 rows other than the target. Click the target checkbox child only when its row is not already aria-checked=true.",
      offscreen_strategy:
        "Click target_checkbox_selector with a DOM locator. Only if that fails, scroll inside the first category menu rather than the page body.",
      fallback_guard:
        "Use target_checkbox_fallback_selector only when the strict selector count is 0 and the fallback count is exactly 1.",
      row_click_warning:
        "Clicking row text may only expand level 2. Select the checkbox child to select the level-1 category.",
    },
    completion_checks: [
      `Visible country equals ${country}.`,
      `Visible level-1 category equals ${category}.`,
      "No second level-1 category remains selected; overflow is absent or +0.",
      "The exact requested start and end dates are visible.",
      "After 保存, loading is gone and numeric ranking rows are present.",
    ],
    collection_checks: [
      "For each requested banner, collect at most 50 rows or all available rows when fewer exist.",
      "Ranks are unique, ascending, and contain no unexplained gaps.",
      "The last collected rank equals the collected row count when ranking starts at 1.",
      "A filter failure is not a zero-result dataset.",
    ],
    recovery_order: [
      "fresh_dom_snapshot",
      "exact_dom_locator_auto_scroll",
      "overlay_scoped_visual_scroll",
      "same_authenticated_session_xhr_or_api",
      "page_export_then_product_id_join",
    ],
    user_interaction_policy: {
      may_request_once: ["browser_permission", "login"],
      never_request:
        "Manual scrolling or repeated manual country/category selection.",
    },
  };

  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

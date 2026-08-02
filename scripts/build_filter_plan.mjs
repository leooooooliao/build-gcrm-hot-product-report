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

function resolveCategory(input) {
  const exactLevelOne = options.level_1_categories
    .find((item) => normalize(item) === normalize(input));
  if (exactLevelOne) {
    return {
      level: 1,
      level_1: exactLevelOne,
      level_2: null,
      path: exactLevelOne,
    };
  }

  const parts = String(input).split(/[>＞]/).map((item) => item.trim()).filter(Boolean);
  if (parts.length === 2) {
    const levelOne = options.level_1_categories
      .find((item) => normalize(item) === normalize(parts[0]));
    const levelTwo = levelOne && options.category_hierarchy[levelOne]
      .find((item) => normalize(item) === normalize(parts[1]));
    if (levelOne && levelTwo) {
      return {
        level: 2,
        level_1: levelOne,
        level_2: levelTwo,
        path: `${levelOne} > ${levelTwo}`,
      };
    }
  }

  const exactLevelTwo = Object.entries(options.category_hierarchy)
    .flatMap(([levelOne, children]) => children
      .filter((item) => normalize(item) === normalize(input))
      .map((levelTwo) => `${levelOne} > ${levelTwo}`));
  if (exactLevelTwo.length) {
    throw new Error(`二级类目必须先由用户确认完整路径：${exactLevelTwo.join(" / ")}`);
  }
  throw new Error(`类目不在当前筛选版本中：${input}`);
}

function main() {
  const args = argsOf(process.argv.slice(2));
  if (!args.country || !args.category) {
    throw new Error(
      "Usage: node scripts/build_filter_plan.mjs --country <COUNTRY> --category <精确一级类目或已确认的 一级类目 > 二级类目>",
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
  const category = resolveCategory(args.category);

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
  const levelTwoMenu = [
    visibleCategoryDropdown,
    " .potoo-marketing-advisor-cascader-menus",
    " > .potoo-marketing-advisor-cascader-menu:nth-of-type(2)",
  ].join("");
  const levelOneRow = [
    levelOneMenu,
    " li[role=\"menuitemcheckbox\"]",
    `[title=${cssString(category.level_1)}]`,
  ].join("");
  const levelTwoRow = category.level === 2
    ? [
      levelTwoMenu,
      " li[role=\"menuitemcheckbox\"]",
      `[title=${cssString(category.level_2)}]`,
    ].join("")
    : null;

  const categorySelection = {
    category_level: category.level,
    category_path: category.path,
    trigger_selector:
      ".potoo-marketing-advisor-cascader > .potoo-marketing-advisor-select-selector",
    visible_dropdown_selector: visibleCategoryDropdown,
    level_one_menu_selector: levelOneMenu,
    level_two_menu_selector: category.level === 2 ? levelTwoMenu : null,
    checked_category_rows_selector:
      `${visibleCategoryDropdown} li[role="menuitemcheckbox"][aria-checked="true"]`,
    parent_row_selector: levelOneRow,
    parent_checked_selector: `${levelOneRow}[aria-checked="true"]`,
    parent_checkbox_selector:
      `${levelOneRow} .potoo-marketing-advisor-cascader-checkbox`,
    selected_value_selector:
      ".potoo-marketing-advisor-cascader .potoo-marketing-advisor-select-selection-item-content",
    overflow_marker_selector:
      ".potoo-marketing-advisor-cascader .potoo-marketing-advisor-select-selection-overflow-item-rest",
    offscreen_strategy:
      "Use exact DOM locators so the browser auto-scrolls inside the open Cascader. If unavailable, scroll only inside the relevant visible menu, never the page body.",
    row_click_warning:
      "The parent row and its checkbox have different jobs: row click expands level 2; checkbox click selects level 1.",
  };

  if (category.level === 1) {
    Object.assign(categorySelection, {
      target_row_selector: levelOneRow,
      target_checked_selector: `${levelOneRow}[aria-checked="true"]`,
      target_checkbox_selector:
        `${levelOneRow} .potoo-marketing-advisor-cascader-checkbox`,
      target_checkbox_fallback_selector:
        `${visibleCategoryDropdown} li[role="menuitemcheckbox"][title=${cssString(category.level_1)}] .potoo-marketing-advisor-cascader-checkbox`,
      selection_strategy:
        "Clear checked category rows other than the target. Click the target level-1 checkbox child only when the row is not already aria-checked=true. Do not ask whether the user wants a level-2 category.",
      fallback_guard:
        "Use target_checkbox_fallback_selector only when the strict selector count is 0 and the fallback count is exactly 1.",
    });
  } else {
    Object.assign(categorySelection, {
      parent_expand_selector: levelOneRow,
      target_row_selector: levelTwoRow,
      target_checked_selector: `${levelTwoRow}[aria-checked="true"]`,
      target_checkbox_selector:
        `${levelTwoRow} .potoo-marketing-advisor-cascader-checkbox`,
      target_checkbox_fallback_selector:
        `${visibleCategoryDropdown} li[role="menuitemcheckbox"][title=${cssString(category.level_2)}] .potoo-marketing-advisor-cascader-checkbox`,
      selection_strategy:
        "Clear existing checked category rows. Click parent_expand_selector on the row body, not parent_checkbox_selector. Take a fresh DOM snapshot after level 2 appears, then click the exact level-2 checkbox child. The parent level-1 row must remain aria-checked=false.",
      fallback_guard:
        "Use the level-2 fallback only when the strict level-2 selector count is 0, the fallback count is exactly 1, and parent_checked_selector count is 0.",
      accidental_parent_recovery:
        "If the parent became checked, click parent_checkbox_selector once to clear it, re-expand the parent row, refresh the DOM snapshot, and select only the target level-2 checkbox.",
    });
  }

  const plan = {
    schema_version: "1.1.0",
    generated_from: "references/filter-options.json",
    taxonomy_snapshot: options.taxonomy_snapshot,
    page_url: options.source_page,
    country,
    category: category.path,
    category_level: category.level,
    category_l1: category.level_1,
    category_l2: category.level_2,
    manual_filter_selection_required: false,
    operation_order: [
      "navigate_country_url",
      "verify_country",
      category.level === 1 ? "select_one_level_1_category" : "expand_level_1_then_select_one_level_2_category",
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
    category_selection: categorySelection,
    completion_checks: [
      `Visible country equals ${country}.`,
      category.level === 1
        ? `The only checked category row is level 1: ${category.level_1}.`
        : `The only checked category row is level 2: ${category.level_2}; parent ${category.level_1} remains unchecked.`,
      "Overflow is absent or +0.",
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

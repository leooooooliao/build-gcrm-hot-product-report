---
name: build-gcrm-hot-product-report
description: Generate a concise merchant-facing GCRM hot-product report for one country, one current GCRM level-1 category, and one date range, delivered as a polished Feishu Sheet plus a concise Feishu recommendation document. Use when a user says “帮我做一份类目爆品报告”“看看 US 宠物用品最近30天卖得好的商品”，或 asks for a 品类日报/月报、爆品榜单、选品报告、Top Product 分析、近期爆品、增长品、直播/短视频驱动判断，或要求从 GCRM Product Insights 榜单抓取、匹配导出并整理成带图片、中英文商品名、客单价与 TR 的飞书表格。
---

# 类目爆品报告

Create one decision-ready report for one market and one level-1 category. Keep the interaction short and make the output reproducible.

Users do not need to remember the English skill identifier. Treat natural requests such as the following as direct invocations:

> 帮我做一份类目爆品报告吧：国家是 US，类目是宠物用品，时间看最近30天。

Read `references/agent-compatibility.md` when installing or running outside Codex.
Resolve every bundled script and reference relative to the directory containing this `SKILL.md`, regardless of the user's current working directory.

## 0. Check for a stable update

At the start of every invocation, run this once from the Skill directory before asking for report inputs:

```bash
node scripts/check_for_updates.mjs
```

If the result is `update_available`, read `references/update-runbook.md` and apply the verified stable Release before continuing. Re-read the updated `SKILL.md` once and do not restart the update check in the same request.

If the check fails because GitHub or network access is unavailable, continue with the installed version. Never block a report on an update check, follow an unreleased branch, or overwrite a modified local Skill.

## 1. Resolve and validate the request

Read `references/filter-options.json` and `references/interaction.md`.

Require exactly three inputs:

1. Country or SEA child country.
2. Exact current-version GCRM level-1 category.
3. Date range.

If the category is missing, or the user asks what categories are supported, run:

```bash
node scripts/validate_request.mjs --list-options
```

Show every item in `category_options_text` immediately. Do not show only examples, abbreviate the list, or ask the user to guess a label. If the user already supplied an exact valid category, do not repeat the full list.

Run:

```bash
node scripts/validate_request.mjs --country "<input>" --category "<input>" --start "YYYY-MM-DD" --end "YYYY-MM-DD"
```

Always tell the user that category labels follow the GCRM Top Product taxonomy snapshot named in the validator output. Do not continue on an ambiguous or invalid category. Give at most three close candidates and ask the user to confirm the exact label.

When a supplied category is invalid, show the three closest candidates first, then the complete current category list returned by the validator so the user can choose an exact label.

Accept an alias only after showing the mapped platform label. Treat broad inputs such as `家居` as ambiguous because they may mean `家居用品`、`家具`、`家纺布艺` or `家装建材`.

If the user gives `SEA`, ask whether they want the SEA aggregate or one of `TH / ID / VN / PH / MY / SG`. Never pull all countries unless explicitly requested.

## 2. Collect only the requested slice

Read `references/browser-runbook.md`. Build the deterministic filter plan:

```bash
node scripts/build_filter_plan.mjs \
  --country "<confirmed country>" \
  --category "<confirmed exact level-1 category>"
```

Open the internal GCRM Top Product page in the user's authenticated browser session:

`https://mmm.tiktok-row.net/gcrm_overseas/phoenix/marketing-advisor/product-insights/top-product`

Follow the plan's fixed order: country first, then the single level-1 category, then the exact dates, then save and wait. Country and Category are custom TreeSelect/Cascader controls, not native `<select>` elements.

When a target is offscreen or virtualized, use an exact DOM locator so the browser auto-scrolls inside the open overlay. If that fails, scroll only inside the visible dropdown; never treat page-body scrolling as a substitute. Expand SEA before selecting TH / ID / VN / PH / MY / SG.

The user may be asked once to enable browser control or log in. Never ask the user to scroll, expand SEA, or repeatedly select countries, categories, banners, or pages. If all safe paths fail, return partial results with `collection_blocked`; never describe a filter failure as “no data”.

After saving, re-read the visible country, the single selected level-1 category, the exact dates, and numeric result rows. A successful click is not a completed filter.

Collect at most:

- GMV Top 50
- 销量 Top 50
- 广告消耗 Top 50
- 飙升 Top 50, or every available row when fewer than 50 exist

For every collected row, treat total GMV, live/video/product-card GMV,
order volume, the displayed average price (`avg_price`), ads cost, product ID,
title, shop, categories, and image URL when available as mandatory source
fields. Do not replace the displayed average price with `GMV / orders`.

If a recommended product is missing `avg_price`, `ads_cost`, or total GMV,
complete delivery is blocked until the source is collected again.

Do not collect other markets or categories as samples.

Use this acquisition order:

1. Prefer a page API/XHR response when it exposes the full table and image URLs.
2. Otherwise use the page export for product IDs, names, shops, categories, and image URLs; read the missing GMV/channel intervals from the page or its data response.
3. Join export and page values by `product_id`. Use normalized title plus shop only as a fallback and label the join as uncertain.
4. Otherwise use structured DOM extraction with page size 50/100 or deterministic pagination until rank 50 or the final available row.
5. Use screenshots only for a small number of recommended products when no image URL can be obtained.

Never claim a title-only match is a confirmed product match.

For every banner, verify that ranks are unique and ascending, no unexplained gaps exist, and the final collected count is at most 50 or equals all available rows. Do not visually scroll through 50 rows when a structured acquisition path is available.

## 3. Normalize and analyze

Read `references/data-contract.md`, `references/translation-rules.md`, and `references/analysis-rules.md`.

Create one JSON input matching the contract. Preserve blurred intervals exactly as displayed. Use interval midpoints only for calculations:

- `直播占比 = 直播GMV区间中点 / 总GMV区间中点`
- `短视频占比 = 短视频GMV区间中点 / 总GMV区间中点`
- `TR（估） = 广告消耗区间中点 / 总GMV区间中点`

Display TR and channel shares as one-decimal percentages. They are estimates;
channel shares may not sum to 100% because each source range is independently
blurred. Keep the label `TR（估）` and never present it as a precise take rate.

Create one concise Chinese product name for every unique collected product. Deduplicate by `product_id`, translate once, and store the result in `product_translations`. Then run:

```bash
node scripts/validate_translations.mjs --input "<report-spec.json>"
```

Do not build the workbook until the validator reports zero missing or invalid translations.

Run the mandatory metric and recommendation-label gate:

```bash
node scripts/validate_metrics.mjs --input "<report-spec.json>"
```

Do not continue until it reports `valid: true`. This gate checks rank integrity,
the displayed average price, ads cost, total GMV, midpoint TR, recommendation
IDs, the single action-label system, and exactly three conclusion bullets.

Before writing conclusions, run:

```bash
node scripts/score_candidates.mjs --input "<report-spec.json>" --output "<analysis-pack.json>"
```

Use the analysis pack as the candidate shortlist and evidence table. Do not let the model invent its own ranking without explaining an override.

Prepare:

- Three short conclusion bullets.
- Up to four persistent/scale benchmark products.
- Eight to ten high-growth or next-wave products.
- One short qualitative insight per recommended product.
- Category opportunity actions based on the GMV Top 50.

Use only one merchant-facing label field, `建议动作`:

- `快速跟进`: scale and growth are credible, the use case is clear, and the product archetype is quickly copyable.
- `条件跟进`: the opportunity is credible but depends on live, supply-chain, after-sales, or compliance capability.
- `小单测试`: growth is promising but scale, base, or persistence is not yet proven.
- `仅作标杆`: useful for learning product/price/content design but not a direct sourcing recommendation.

Do not create overlapping fields such as `机会标签`, `建议级别`, or `优先关注`.

Label non-data explanations with `推测`. Focus on seasonality, product pain point, content demonstrability, logistics/after-sales, safety, and compliance. Do not pad the report with medians or descriptive statistics that do not change a merchant decision.

## 4. Build the verified spreadsheet source

Prefer the bundled Node runtime and `@oai/artifact-tool` paths when the host provides them. In Codex, use paths returned by `load_workspace_dependencies` and create `node_modules` as a symlink to the returned bundled directory in a writable task directory.

Run:

```bash
node scripts/build_report.mjs --input "<report-spec.json>" --output "<output.xlsx>" --preview-dir "<preview-dir>"
```

If the host does not provide `@oai/artifact-tool`, use its native Feishu Sheet
tools to reproduce the four-sheet contract directly with typed data and native
styles. Do not pretend the bundled script ran. Only fall back to normalized JSON
when the host can create and verify neither the online sheet nor an XLSX transfer
artifact.

Treat this XLSX as a verified transfer artifact for Feishu, not the normal final
user deliverable. In Codex, write it under `outputs/<thread_id>/`. On other
agents, use the platform's normal temporary or artifact directory.

The workbook must contain exactly:

1. `结论`
2. `选品池`
3. `Top50原始榜单`
4. `使用说明`

Keep the established visual contract:

- White body; dark navy section/table headers only.
- Green font for increases; red font for decreases.
- Product names stay on one line and clip instead of creating tall rows.
- Show `中文商品简称` next to the original product title on the conclusion, selection-pool, and raw-data sheets.
- Show the source-page average price and midpoint-estimated TR on conclusion, selection-pool, and raw-data sheets.
- Embed images for the selection pool and recommended products when available.
- No decorative charts, KPI cards, heavy fills, or excessive borders.
- Keep raw data and formulas auditable.

## 5. Publish the Feishu Sheet and recommendation document

Read `references/feishu-delivery.md`. The two normal final deliverables are:

1. A polished Feishu Sheet containing the complete four-sheet report.
2. A concise Feishu document generated from the same `report-spec.json` and
   linked to that Feishu Sheet. It is not a copy of the full table and must not
   contain a Top 50 table.

Use the host's authenticated Feishu/Lark Sheets capability. Prefer importing the
verified XLSX with the native workbook-import operation, then inspect and repair
the online result with native sheet operations. Do not attach the XLSX to the
document when the Feishu Sheet was created successfully.

Run:

```bash
node scripts/build_feishu_brief.mjs \
  --input "<report-spec.json>" \
  --output "<feishu-brief.xml>" \
  --sheet-url "<created Feishu Sheet URL>"
```

The brief must contain only:

1. Market, exact GCRM level-1 category, period, and taxonomy snapshot.
2. The same three conclusion bullets as the Feishu Sheet.
3. Six to eight strongest recommendations by default: at most two benchmarks and up to six growth products. Use fewer rather than weaken evidence gates.
4. For every recommendation: small image when available, Chinese name, action, GMV interval/change, displayed average price, `TR（估）`, live/video shares, driver, and one concise recommendation paragraph.
5. The four action definitions.
6. A visible link card to the complete Feishu Sheet.

Create the document with the host's authenticated Feishu/Lark document tool.
After creation, fetch it again and verify the scope, three bullets,
recommendation count, average prices, TR values, action definitions, and Feishu
Sheet link against the JSON and online sheet.

If the host cannot write Feishu Sheets or documents, return the verified XLSX
and portable XML as an explicit fallback. Never claim a live Feishu artifact was
created, and never weaken the data or validation contract merely because the
preferred delivery channel is unavailable.

## 6. Verify and hand off

Require all of the following:

- Formula-error scan returns zero matches.
- Translation validation returns zero missing or invalid Chinese names.
- Metric validation returns `valid: true`.
- Each sheet is rendered and visually checked.
- Key conclusion values reconcile with the GMV Top 50 source.
- The XLSX archive passes an integrity check.
- Embedded-image count is reported.
- The Feishu Sheet contains exactly the expected four sheets and is read back.
- Formula verification on the Feishu Sheet returns `status: success` when the imported workbook contains formulas.
- Header style, clipped product names, increase/decrease colors, row counts, and image coverage are checked online.
- Feishu XML is generated from the same recommendation IDs as the sheet.
- The created Feishu document is fetched and reconciled, including its Feishu Sheet link, or a clear Feishu capability blocker is reported.

In the final answer, state the exact market/category/period, row counts, image
coverage, Feishu recommendation count, and the 3–5 strongest merchant
takeaways. Link the final Feishu Sheet and Feishu document; do not expose the
intermediate XLSX/JSON/XML unless Feishu creation is blocked.

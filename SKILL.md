---
name: build-gcrm-hot-product-report
description: Generate a concise merchant-facing GCRM hot-product Excel report for one country, one current GCRM level-1 category, and one date range. Use when a user says “帮我做一份类目爆品报告”“看看 US 宠物用品最近30天卖得好的商品”，或 asks for a 品类日报/月报、爆品榜单、选品报告、Top Product 分析、近期爆品、增长品、直播/短视频驱动判断，或要求从 GCRM Product Insights 榜单抓取、匹配导出并整理成带图片的 Excel。
---

# 类目爆品报告

Create one decision-ready report for one market and one level-1 category. Keep the interaction short and make the output reproducible.

Users do not need to remember the English skill identifier. Treat natural requests such as the following as direct invocations:

> 帮我做一份类目爆品报告吧：国家是 US，类目是宠物用品，时间看最近30天。

Read `references/agent-compatibility.md` when installing or running outside Codex.

## 1. Resolve and validate the request

Read `references/filter-options.json` and `references/interaction.md`.

Require exactly three inputs:

1. Country or SEA child country.
2. Exact current-version GCRM level-1 category.
3. Date range.

Run:

```bash
node scripts/validate_request.mjs --country "<input>" --category "<input>" --start "YYYY-MM-DD" --end "YYYY-MM-DD"
```

Always tell the user that category labels follow the GCRM Top Product taxonomy snapshot named in the validator output. Do not continue on an ambiguous or invalid category. Give at most three close candidates and ask the user to confirm the exact label.

Accept an alias only after showing the mapped platform label. Treat broad inputs such as `家居` as ambiguous because they may mean `家居用品`、`家具`、`家纺布艺` or `家装建材`.

If the user gives `SEA`, ask whether they want the SEA aggregate or one of `TH / ID / VN / PH / MY / SG`. Never pull all countries unless explicitly requested.

## 2. Collect only the requested slice

Open the internal GCRM Top Product page in the user's authenticated browser session:

`https://mmm.tiktok-row.net/gcrm_overseas/phoenix/marketing-advisor/product-insights/top-product`

Set the confirmed country, category, and period in the UI before collecting data. Confirm that the visible page state matches all three inputs.

Collect at most:

- GMV Top 50
- 销量 Top 50
- 广告消耗 Top 50
- 飙升 Top 50, or every available row when fewer than 50 exist

Do not collect other markets or categories as samples.

Use this acquisition order:

1. Prefer a page API/XHR response when it exposes the full table and image URLs.
2. Otherwise use the page export for product IDs, names, shops, categories, and image URLs; read the missing GMV/channel intervals from the page or its data response.
3. Join export and page values by `product_id`. Use normalized title plus shop only as a fallback and label the join as uncertain.
4. Use screenshots only for a small number of recommended products when no image URL can be obtained.

Never claim a title-only match is a confirmed product match.

## 3. Normalize and analyze

Read `references/data-contract.md` and `references/analysis-rules.md`.

Create one JSON input matching the contract. Preserve blurred intervals exactly as displayed. Use interval midpoints only for calculations:

- `直播占比 = 直播GMV区间中点 / 总GMV区间中点`
- `短视频占比 = 短视频GMV区间中点 / 总GMV区间中点`

The shares are estimates and may not sum to 100% because each source range is independently blurred.

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

Label non-data explanations with `推测`. Focus on seasonality, product pain point, content demonstrability, logistics/after-sales, safety, and compliance. Do not pad the report with medians or descriptive statistics that do not change a merchant decision.

## 4. Build the workbook

Prefer the bundled Node runtime and `@oai/artifact-tool` paths when the host provides them. In Codex, use paths returned by `load_workspace_dependencies` and create `node_modules` as a symlink to the returned bundled directory in a writable task directory.

Run:

```bash
node scripts/build_report.mjs --input "<report-spec.json>" --output "<output.xlsx>" --preview-dir "<preview-dir>"
```

If the host does not provide `@oai/artifact-tool`, use its native spreadsheet/file tools to reproduce the workbook contract below. Do not pretend the bundled script ran. If the host cannot create or visually verify XLSX files, return the normalized JSON and explain the capability blocker instead of fabricating a workbook.

In Codex, write the final workbook under `outputs/<thread_id>/`. On other agents, use the platform's normal writable artifact/output directory and attach the resulting file.

The workbook must contain exactly:

1. `结论`
2. `选品池`
3. `Top50原始榜单`
4. `使用说明`

Keep the established visual contract:

- White body; dark navy section/table headers only.
- Green font for increases; red font for decreases.
- Product names stay on one line and clip instead of creating tall rows.
- Embed images for the selection pool and recommended products when available.
- No decorative charts, KPI cards, heavy fills, or excessive borders.
- Keep raw data and formulas auditable.

## 5. Verify and hand off

Require all of the following:

- Formula-error scan returns zero matches.
- Each sheet is rendered and visually checked.
- Key conclusion values reconcile with the GMV Top 50 source.
- The XLSX archive passes an integrity check.
- Embedded-image count is reported.

In the final answer, state the exact market/category/period, row counts, image coverage, and the 3–5 strongest merchant takeaways. Attach or link only the final workbook; in Codex, cite only that workbook.

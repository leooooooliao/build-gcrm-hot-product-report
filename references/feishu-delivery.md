# Feishu delivery runbook

Use this runbook only after the report JSON, metrics, translations,
recommendation labels, and local spreadsheet structure have passed validation.
The normal final handoff is one Feishu Sheet plus one concise Feishu document.

## 1. Detect capability and identity

- Use the host's authenticated Feishu/Lark user identity. Do not create the
  deliverables as a bot when a user identity is available.
- Load the host's Feishu Sheets and document instructions before writing.
- If either write capability is absent, use the local XLSX/XML fallback and
  state the blocker. Do not claim an online artifact exists.

## 2. Create the Feishu Sheet

Use the deterministic path below so a weaker agent does not redesign the report:

1. Build and validate the four-sheet XLSX with `scripts/build_report.mjs`.
2. Import that file with the host's native Feishu workbook-import operation.
   With `lark-cli`, use `sheets +workbook-import --file <relative-path>
   --name <report-name> --as user`. Import creates a new Feishu Sheet; it does
   not append to an existing workbook.
3. Save the returned spreadsheet URL/token. A successful request is not enough:
   wait until the import reports ready.
4. Run workbook-info on the online spreadsheet and require exactly these sheets,
   in order: `结论`, `选品池`, `Top50原始榜单`, `使用说明`.
5. If the workbook contains formulas, run the host's whole-workbook formula
   verifier. `success` is required; `partial` is not success.
6. Read back the title/header areas and representative first/last rows from every
   sheet. Reconcile row counts, product IDs, average price, TR, live/video shares,
   and recommendation IDs with `report-spec.json`.

If import is unavailable but native Sheet creation is available, reproduce the
same four sheets with typed data and native styles. Do not flatten numeric fields
into strings merely to simplify writing.

## 3. Online visual contract

Import should preserve the established workbook appearance. Inspect the online
result and use native Feishu Sheet operations only to repair visible drift:

- white data body; dark navy `#17365D` table and section headers; white bold
  header text;
- increases use green font; decreases use red font;
- no decorative charts, KPI cards, large fill blocks, or dense borders;
- original and Chinese product names remain one line and use clip, not wrap;
- numbers remain typed; percentages show one decimal; money uses a consistent
  currency/number format;
- freeze the established header rows and retain practical column widths;
- keep recommendation and selection-pool images aligned with their product rows.

If imported images are missing, restore images for the recommendation and
selection-pool rows with the native cell-image operation. Do not use free-floating
images for row-bound product pictures. Report online image coverage after repair.

## 4. Create the Feishu document

Build the document XML only after the Sheet URL exists:

```bash
node scripts/build_feishu_brief.mjs \
  --input "<report-spec.json>" \
  --output "<feishu-brief.xml>" \
  --sheet-url "<Feishu Sheet URL>"
```

Create the document with the authenticated user identity. The final `完整数据`
section must show a visible link card named `查看完整飞书电子表格`; do not attach
the intermediate XLSX. Keep the document limited to the period/category/market,
three conclusions, six to eight strongest recommendations, action definitions,
and the metric-method note.

Fetch the document again and verify the Sheet URL, three conclusions,
recommendation count, recommendation IDs/names, average price, TR, channel mix,
images, and action definitions.

## 5. Handoff

Return both live URLs. State market, exact level-1 category, period, online row
counts, image coverage, formula-verification result, and recommendation count.
Never expose the intermediate XLSX unless the online delivery failed.

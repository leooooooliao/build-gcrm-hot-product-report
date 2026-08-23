# Feishu delivery runbook

Use this runbook only after the report JSON, metrics, translations,
recommendation labels, exact 2+6 delivery manifest, and local spreadsheet
structure have passed validation.
The normal final handoff is one Feishu Sheet plus one concise Feishu document.

Before creating either artifact, require:

```bash
node scripts/build_delivery_manifest.mjs \
  --input "<report-spec.json>" \
  --output "<delivery-manifest.json>"
```

This manifest is the only recommendation source for both artifacts. Never build
one artifact from GMV rows and the other from a newly constructed GMV/rising
map. Do not expose either live URL until section 5 reconciliation passes.

## 1. Detect capability and identity

- Use the host's authenticated Feishu/Lark user identity. Do not create the
  deliverables as a bot when a user identity is available.
- Load the host's Feishu Sheets and document instructions before writing.
- If either write capability is absent, use the local XLSX/XML fallback and
  state the blocker. Do not claim an online artifact exists.

## 2. Create the Feishu Sheet

Use the deterministic path below so a weaker agent does not redesign the report:

1. Print `scripts/validate_sheet_delivery.mjs --print-contract`, then build the
   XLSX with `scripts/build_report.mjs`. It has four core sheets plus the
   required `素材链接` query-result/status sheet.
2. Import that file with the host's native Feishu workbook-import operation.
   With `lark-cli`, use `sheets +workbook-import --file <relative-path>
   --name <report-name> --as user`. Import creates a new Feishu Sheet; it does
   not append to an existing workbook.
3. Save the returned spreadsheet URL/token. A successful request is not enough:
   wait until the import reports ready.
4. Run workbook-info on the online spreadsheet and require these core sheets in
   order: `结论`, `选品池`, `Top50原始榜单`, `使用说明`. Extra well-defined
   sheets are allowed to the right. Require `素材链接` in all complete deliveries.
5. If the workbook contains formulas, run the host's whole-workbook formula
   verifier. `success` is required; `partial` is not success.
6. Read back every required header plus representative first/last rows from
   every sheet. A header cannot contain a line break, and interval/change pairs
   must be separate cells. The first eight `选品池` rows must match the manifest
   order and contain
   the delivery position, recommendation type, Product ID, source banner/rank,
   Chinese name, archetype, action, insight, GMV/change, average price, TR,
   live/video shares, driver, and delivery ID.

Create the readback shape defined in `references/sheet-contract.md` and run:

```bash
node scripts/validate_sheet_delivery.mjs --input "<sheet-delivery-readback.json>"
```

Require `valid: true` before building the document. If import is unavailable but
native Sheet creation is available, reproduce the same core sheets with typed
data and native styles. Do not flatten numeric fields into strings merely to
simplify writing.

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

Require a valid `market_context` record before building the document. When one
to three signals passed the strict relevance gate, render `近期市场信号` after
`本期结论`; when none passed, omit the section completely. Never convert an
empty signal set into a generic news summary.

Build the document XML only after the Sheet URL exists:

```bash
node scripts/build_feishu_brief.mjs \
  --input "<report-spec.json>" \
  --output "<feishu-brief.xml>" \
  --sheet-url "<Feishu Sheet URL>" \
  --creative-links "<creative-links.json>"
```

Create the document with the authenticated user identity. The final `完整数据`
section must show a visible link card named `查看完整飞书电子表格`; do not attach
the intermediate XLSX. Keep the document limited to the period/category/market,
three conclusions, optional validated recent market signals, action definitions,
the same eight recommendations from the fixed 2+6 manifest, and the metric-method note. Present `标杆品` and `增长品` as
separate narrative sections, never as a product table. Each product contains an
image, core metrics, `为什么值得看`, labeled local-market context,
`结论与动作`, and one to three material links when available.

Fetch the document again and verify the Sheet URL, three conclusions, any
rendered market signals and source links,
recommendation count and order, names, average price, TR, channel mix, images,
local-context labels, action definitions, material links, delivery ID, and the
same Sheet URL.

## 5. Mandatory reconciliation

Normalize the online Sheet readback and the fetched Feishu document into two
JSON files using the exact `Delivery readback contract` in
`references/data-contract.md`. Read the Sheet from the first eight `选品池`
rows; do not reconstruct it from the raw ranking tabs. Read all eight document
recommendations in heading order and match them to the manifest's unique name,
position, and displayed metrics.

Run:

```bash
node scripts/reconcile_delivery.mjs \
  --manifest "<delivery-manifest.json>" \
  --sheet "<sheet-readback.json>" \
  --brief "<brief-readback.json>"
```

Require `valid: true`. On failure, repair the incorrect artifact from the
manifest, read it back again, and rerun the command. Do not send draft URLs,
create a second independent recommendation calculation, or ask the user to
decide which artifact is correct.

## 6. Handoff

Return both live URLs. State market, exact category path and level, period, online row
counts, image coverage, formula-verification result, recommendation count, and
the shared delivery ID.
Immediately explain how to use both artifacts: name the five document sections
and their purpose, then name every delivered Sheet tab and its purpose. Explain
whether `素材链接` records links, an empty query, or a blocker. Use the fixed
navigation contract in `references/interaction.md` and do not return two bare
links.
Never expose the intermediate XLSX unless the online delivery failed.

# Feishu Sheet contract

Use this contract for both XLSX import and native Feishu Sheet creation. It fixes
business meaning without fixing every implementation detail.

## Non-negotiable outcome

The complete data sheet is a normal final deliverable, not an optional appendix.
Create and read it back before building the recommendation document. A full
delivery needs either:

- a live Feishu/Lark Sheet URL; or
- an explicit `xlsx_fallback` artifact when the host cannot write Feishu Sheets.

Never mark a document-only result as complete.

## Required sheets

Require these core sheets, but allow extra helper sheets:

1. `结论`
2. `选品池`
3. `Top50原始榜单`
4. `使用说明`

Also require `素材链接`. It records the mandatory query attempt even when the
dashboard returns no valid non-NULL URL or remains blocked after one retry. A
product with no link keeps one zero-count/status row; do not fabricate or keep
querying merely to reach five links.

## Atomic cell rule

One cell carries one metric. GCRM source strings often look like
`590K - 600K\n-14.23%`; preserve that source text in JSON, but never write it
directly into the user-facing sheet. Split it into `GMV区间` and `GMV变化`.

Apply the same rule to every composite source metric. If a change field is not
needed in the current report, omit that optional column rather than appending
the change below the interval. If it is needed later, add a separate
`<指标>变化` column.

The exact required headers are machine-readable:

```bash
node scripts/validate_sheet_delivery.mjs --print-contract
```

Required headers may not be deleted, merged, renamed, duplicated, or contain
line breaks. Extra audit columns may be appended to the right.

## Readback shape

Normalize the online Sheet or XLSX verification to:

```json
{
  "delivery_mode": "feishu",
  "sheet_url": "https://example.larkoffice.com/sheets/xxx",
  "sheets": [
    {"name": "结论"},
    {"name": "选品池", "headers": ["来源榜单", "Rank"]},
    {"name": "Top50原始榜单", "headers": ["榜单", "Rank"]},
    {"name": "使用说明"},
    {"name": "素材链接", "headers": ["推荐序号", "推荐类型"]}
  ],
  "creative_query_performed": true,
  "creative_query_status": "completed",
  "expected_raw_rows": 150,
  "actual_raw_rows": 150,
  "recommendation_rows": 8,
  "compound_metric_cells": [],
  "document_created": true,
  "document_sheet_url": "https://example.larkoffice.com/sheets/xxx"
}
```

Populate every header in the real readback; the shortened arrays above only
illustrate the shape. Run:

```bash
node scripts/validate_sheet_delivery.mjs --input "<sheet-readback.json>"
```

Only `valid: true` permits a normal handoff. Do not hard-fail on harmless extra
sheets, extra right-side audit columns, or minor column-width differences.

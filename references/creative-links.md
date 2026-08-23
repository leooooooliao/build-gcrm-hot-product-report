# Creative-link collection

Use this secondary step after the fixed 2+6 recommendation IDs are known. The
query attempt is required; successful links are not. Creative evidence enriches
the report but never replaces GCRM product evidence or blocks the main delivery.

Dashboard:

`https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187`

## Query rules

Read `data-query-routing.md` first. Before opening the dashboard, check whether
the current host exposes `crm-data-query`.

1. When `crm-data-query` is available, use it first with a literal instruction
   beginning `用crm-data-query取数：<dashboard URL>`. When it is absent, use the
   authenticated browser. If the preferred query fails after one exact retry,
   use the browser fallback and record the reason.
2. On a browser fallback, do not wait for the initial all-data query. Set
   `Pdate` and `Ecommerce Product ID` immediately, then run the filtered query.
   Use `Ecommerce Product ID`; Shop Name is not the matching key.
3. Use exactly the eight manifest Product IDs, in at most two batches of no more
   than five IDs. Do not search unrelated products.
4. The creative period may differ from the GCRM period by one or two days; do
   not add work merely to force exact date alignment.
5. Sort by `Dollar Revenue` descending and retain at most five valid, non-NULL
   URL rows per product.
6. Copy the URL field directly. Do not open every creative merely to collect its
   link.
7. Fewer than five links is valid. Do not补查 a low-revenue product simply to
   fill the count.
8. One safe retry is allowed for a transient loading or filter failure. After
   that, record `blocked` with a concise reason and continue the main report.
9. If the filtered query completes with no valid links, record `empty`. If it
   returns at least one valid link, record `completed`. Partial coverage is
   valid and remains `completed`.

Store every attempt as:

```json
{
  "schema_version": "1.2.0",
  "query_status": "completed",
  "attempted": true,
  "attempted_at": "2026-08-21T10:30:00+08:00",
  "routing": {
    "capability_checked": true,
    "crm_data_query_available": true,
    "crm_data_query_attempted": true,
    "query_route": "crm-data-query",
    "query_prompts": [
      "用crm-data-query取数：https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187 请设置 Pdate=YYYY-MM-DD至YYYY-MM-DD，Ecommerce Product ID=173...,174...,175...,176...,177...；返回 Ecommerce Product ID、Dollar Revenue、URL。",
      "用crm-data-query取数：https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187 请设置 Pdate=YYYY-MM-DD至YYYY-MM-DD，Ecommerce Product ID=178...,179...,180...；返回 Ecommerce Product ID、Dollar Revenue、URL。"
    ],
    "fallback_reason": null
  },
  "meta": {
    "source_url": "https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "filter_field": "Ecommerce Product ID",
    "requested_product_ids": ["173...", "174...", "175...", "176...", "177...", "178...", "179...", "180..."]
  },
  "links": [
    {
      "product_id": "173...",
      "creative_rank": 1,
      "dollar_revenue": 3154,
      "url": "https://www.tiktok.com/..."
    }
  ],
  "counts": {"173...": 1, "174...": 0, "175...": 0, "176...": 0, "177...": 0, "178...": 0, "179...": 0, "180...": 0},
  "blocked_reason": null
}
```

Use `query_status: "empty"` with an empty `links` array when the query completed
without a valid URL. Use `query_status: "blocked"` and a non-empty
`blocked_reason` after the single retry; partial valid links may still be kept.
`counts` must include all eight requested IDs, including zeroes.

`query_route` must be `crm-data-query` when that function returned the accepted
rows, `browser` only when capability preflight found no `crm-data-query`, or
`crm-data-query+browser` after an attempted query required browser fallback. The
hybrid route requires `fallback_reason`. When `crm-data-query` is available, one
or two stored prompts must collectively contain all eight IDs and each must set
both `Pdate` and `Ecommerce Product ID`.

Validate before building the Sheet or document:

```bash
node scripts/validate_creative_links.mjs \
  --input "<creative-links.json>" \
  --manifest "<delivery-manifest.json>"
```

The Sheet keeps up to five links per product. The recommendation document shows
only the first one to three; default to two when available. The Sheet always
contains `素材链接`: it shows links, an empty-query status, or the blocker. Never
write “本次未执行素材查询”.

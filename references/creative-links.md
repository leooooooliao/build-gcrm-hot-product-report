# Creative-link collection

Use this secondary step only after the fixed 2+6 recommendation IDs are known.
It enriches the report but does not replace GCRM product evidence.

Dashboard:

`https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187`

## Query rules

1. Before the dashboard's initial all-data query completes, set `Pdate` and
   `Ecommerce Product ID`, then run the filtered query.
2. Query at most five Product IDs together.
3. The creative period may differ from the GCRM period by one or two days; do
   not add work merely to force exact date alignment.
4. Sort by `Dollar Revenue` descending and retain at most five valid, non-NULL
   URL rows per product.
5. Copy the URL field directly. Do not open every creative merely to collect its
   link.
6. Fewer than five links is valid. Do not补查 a low-revenue product simply to
   fill the count.

Store the result as:

```json
{
  "meta": {
    "source_url": "...",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD"
  },
  "links": [
    {
      "product_id": "173...",
      "creative_rank": 1,
      "dollar_revenue": 3154,
      "url": "https://www.tiktok.com/..."
    }
  ],
  "counts": {"173...": 1}
}
```

The Sheet keeps up to five links per product. The recommendation document shows
only the first one to three; default to two when available. If the dashboard is
blocked after one safe retry, continue the main report, state that creative
links were unavailable, and do not claim the query succeeded.

# Report input contract

Pass one UTF-8 JSON file to `scripts/build_report.mjs`.

## Top-level shape

```json
{
  "meta": {
    "country": "US",
    "category": "宠物用品",
    "period_start": "2026-06-25",
    "period_end": "2026-07-25",
    "source_url": "https://mmm.tiktok-row.net/...",
    "taxonomy_snapshot": "2026-07-28"
  },
  "rankings": {
    "GMV Top 50": [],
    "销量 Top 50": [],
    "广告消耗 Top 50": [],
    "飙升 Top 50": []
  },
  "product_translations": {
    "1732277424593932739": "PetPivot开放式自动清洁猫砂盆"
  },
  "summary_bullets": ["...", "...", "..."],
  "recommendations": {
    "benchmarks": [],
    "growth": []
  },
  "category_actions": {
    "Dog & Cat Litter": "..."
  }
}
```

## Ranking row

```json
{
  "rank": 1,
  "product_id": "1732277424593932739",
  "product_name": "Product title",
  "category_l1": "Pet Supplies",
  "category_l2": "Dog & Cat Litter",
  "category_l3": "Litter Trays & Boxes",
  "gmv_total": "590K - 600K\n-14.23%",
  "gmv_live": "340K - 350K\n-19.93%",
  "gmv_video": "150K - 160K\n-7.20%",
  "gmv_product_card": "100K - 110K\n-2.35%",
  "order_volume": "5K - 6K\n-20.14%",
  "avg_price": "111.9\n7.40%",
  "ads_cost": "60K - 70K\n0.34%",
  "refund_rate": "4.5% - 5.0%\n-3.13%",
  "shop_name": "Shop",
  "image_url": "https://...",
  "join_quality": "product_id"
}
```

Keep every numeric interval and change on separate lines exactly as displayed. Use strings for product IDs.

`avg_price` is the average-price value displayed by GCRM. Preserve that source
value and its change; do not derive it from GMV and order intervals.

Required calculated metrics:

- `直播占比（估） = 直播GMV区间中点 / 总GMV区间中点`
- `短视频占比（估） = 短视频GMV区间中点 / 总GMV区间中点`
- `TR（估） = 广告消耗区间中点 / 总GMV区间中点`

Round only the displayed percentage to one decimal. Keep unrounded numbers for
formula audit. Because both inputs are blurred intervals, TR must always retain
the `（估）` suffix.

Every collected row must have parseable `gmv_total`, `avg_price`, and
`ads_cost`. For recommended products, missing any one is a hard error; do not
emit a complete report.

## Chinese product-name mapping

`product_translations` is required. Key it by `product_id` and provide one concise Chinese product name for every unique product across all collected rankings. If a source row legitimately has no product ID, use the exact fallback key `shop_name|product_name`.

Do not repeat translations on each ranking row. Translate once and reuse the mapping so the same product always has the same Chinese name.

Run `scripts/validate_translations.mjs --input <report-spec.json>` before building the workbook.

`join_quality` must be one of:

- `product_id`
- `title_shop_candidate`
- `unmatched`

Do not promote an uncertain join to confirmed.

## Recommendation item

```json
{
  "product_id": "1732277424593932739",
  "archetype": "智能自动猫砂盆",
  "action": "仅作标杆",
  "insight": "长期强痛点、高客单；直播可完整讲清容量、安全与清洁效果。"
}
```

Allowed actions:

- `快速跟进`
- `条件跟进`
- `仅作标杆`
- `小单测试`

Each recommendation ID must exist in `GMV Top 50` or `飙升 Top 50`.

These are the only merchant-facing classification labels. Do not add parallel
fields such as `机会标签`, `建议级别`, `优先关注`, or `观察`. Non-recommended
selection-pool rows use `—` in `建议动作`.

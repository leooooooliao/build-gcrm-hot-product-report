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


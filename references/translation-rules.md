# Chinese product-name rules

Create a concise `中文商品简称` that helps a salesperson understand what the item is at a glance. Do not translate the full promotional title word for word.

## Required structure

Prefer:

`品牌/型号（when useful） + key form or function + product type`

Examples:

- `PetPivot AutoScooper 12 Lite Open-Top Automatic Self-Cleaning Cat Litter Box` -> `PetPivot开放式自动清洁猫砂盆`
- `Hard Bottom Backseat Extenders for Dogs with Door Protection` -> `硬底汽车后排宠物扩展垫`
- `Dog Herding Ball - Push & Chase Toy` -> `大型犬推赶追逐训练球`

## Preserve

- Brand and model when they distinguish the product.
- Meaningful capacities and sizes such as `90L`, `11L`, `32oz`, `47英寸`.
- Core form factor such as open-top, cordless, foldable, hard-bottom.
- The actual product type.

## Remove

- Hashtags and campaign tags.
- `Best Seller`, `New`, sale names, gift language, and keyword stuffing.
- Repeated features that do not change product recognition.
- Unsupported efficacy or quality claims.

## Guardrails

- Target 8–25 Chinese characters, excluding preserved brand/model text.
- Keep the name on one line.
- Do not invent material, certification, medical efficacy, waterproofing, safety, compatibility, or included accessories.
- Translate ambiguous claims conservatively.
- Keep an already clear Chinese product name, shortening only duplicated promotion text.
- Use the same translation for the same `product_id` across all banners. If no product ID exists, use `shop_name|product_name` as the stable fallback key.
- If the source cannot be understood confidently, use a neutral product-type name and flag it for manual review instead of guessing.

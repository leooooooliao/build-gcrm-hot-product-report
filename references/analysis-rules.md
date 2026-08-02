# Analysis rules

## Decision hierarchy

Use individual products as evidence, but recommend at the actionable product-archetype level:

`market opportunity -> product archetype -> content fit -> execution gate`

Every recommendation must contain this evidence chain:

1. `数据事实`: rank, current GMV interval, change, displayed average price, midpoint-estimated TR, and channel share.
2. `商品解释`: the product pain point or observable use scenario.
3. `内容判断`: why live or video can demonstrate it.
4. `执行门槛`: logistics, installation, after-sales, safety, compliance, or low-base risk.
5. `动作`: 快速跟进 / 条件跟进 / 仅作标杆 / 小单测试.

If one link is missing, weaken the action rather than filling the gap with imagination.

## Benchmark products

Select up to four products with meaningful GMV scale and persistent top placement. A falling product may remain a benchmark, but label it `仅作标杆` when copying it is not attractive.

Default benchmark eligibility:

- GMV Top 50 rank is 10 or better.
- `product_id` match is confirmed.
- The product represents a reusable product archetype, not only a brand-specific bundle.

## Growth products

Select eight to ten products using:

1. Meaningful current GMV scale.
2. Strong positive GMV change or appearance in the rising list.
3. A clear product pain point or use scenario.
4. Demonstrable content fit.
5. A feasible merchant execution path.

Treat extreme growth cautiously. Mention low-base, new-product, or promotion effects when plausible. Use `小单测试` for promising low-scale rising products.

Use `scripts/score_candidates.mjs` to create the initial shortlist. The model may override the order only with an explicit reason based on execution feasibility or duplicated product archetypes.

Do not select ten near-identical SKUs. Keep at most two examples for one product archetype unless their channel or execution model is materially different.

## Channel driver

Use estimated midpoint shares:

- Live-driven: live share is at least 50% and exceeds video share.
- Video-driven: video share is at least 50% and exceeds live share.
- Otherwise: mixed/other.

Discuss live versus video in the merchant conclusions. Keep product-card data only in raw evidence unless it changes the decision.

Use these execution implications:

- Video-driven: favor strong visual proof, before/after, installation, reaction, or problem-solution content.
- Live-driven: require a clear demonstration script, objection handling, and adequate host expertise.
- Mixed/other: do not force a live or video narrative.

## Average price and take rate

- Average price is a mandatory source metric. Read the displayed GCRM value; do
  not recalculate it from independently blurred GMV and order intervals.
- `TR（估） = ads-cost interval midpoint / total-GMV interval midpoint`.
- Show TR as a one-decimal percentage and keep its estimate label everywhere.
- Use TR to discuss approximate paid-traffic intensity and economics, not as an
  exact profitability measure.
- Do not invent a universal “good TR” threshold. Interpret it together with
  current scale, growth, ticket size, content driver, refund risk, and the
  merchant's actual margin.
- A high-growth product with a visibly high TR may be paid-traffic-dependent;
  require an organic-content or margin gate before scaling.
- A low TR does not prove organic demand when attribution or the source range is incomplete.

## Category opportunity

Aggregate the GMV Top 50 by level-2 category:

- product count
- GMV midpoint sum
- positive-growth product count
- comparable aggregate growth
- estimated live share
- estimated video share

Rank primarily by GMV midpoint. Highlight a smaller category only when growth and followability are both strong.

When a previous daily snapshot is available, match by `product_id` and add these internal labels:

- Persistent: top-ranked in both snapshots.
- Newly hot: enters the GMV Top 50 with meaningful scale.
- Warming: positive change and improving rank.
- Fading/activity-driven: rank or GMV falls after a temporary spike.

Do not use a cumulative multi-month rank as a substitute for snapshot comparison.

## Qualitative insight

Write one or two sentences per recommended product. Use `推测` for explanations not directly proven by the table.

Useful lenses:

- seasonality and weather
- travel or holiday timing
- pet/user pain point
- visual before/after or reaction content
- live explanation requirement
- logistics, installation, after-sales
- safety and compliance
- repeat purchase versus novelty

Avoid generic claims such as “market demand is strong” without saying why the product is followable.

Use this sentence pattern:

> `<data fact>`；推测 `<product/season/content explanation>`；`<merchant action and risk>`.

Never state that weather, holidays, trends, or user preferences caused growth unless separately verified. In the workbook they remain labeled `推测`.

## Anti-hallucination gates

- No `product_id`: do not call the match confirmed.
- Title/shop fallback: label it candidate evidence and do not use it as the sole reason for `快速跟进`.
- Growth above 300%: flag possible low base/new product/promotion effect.
- Current GMV below the slice's lower quartile: prefer `小单测试`.
- Falling GMV: it may be a benchmark but not a growth recommendation.
- Live share above 50% plus high ticket: require a live capability and after-sales gate.
- Health, food, supplement, pesticide, medical, safety, or efficacy claims: require compliance review.
- Missing channel intervals: use `混合/其他`; do not guess a channel driver.
- Missing displayed average price, ads cost, or total GMV: do not recommend the product or complete delivery.
- Qualitative claims must not introduce exact numbers absent from the source.

## Output restraint

- Three conclusion bullets.
- Four benchmark products maximum.
- Ten growth products maximum.
- Seven level-2 category rows maximum.
- No median discussion unless the user explicitly requests it.
- Preserve raw evidence and uncertainty.

## Feishu brief

Use the Feishu Sheet recommendation IDs as the single source of truth. The Feishu
brief normally contains at most two benchmark products and up to six growth
products. Do not repeat the Top 50 table. For each retained product, show the
Chinese name, image when available, action, GMV/change, displayed average price,
`TR（估）`, live/video mix, driver, and one concise reason/action paragraph.

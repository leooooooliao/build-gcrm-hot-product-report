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

Select exactly two products with meaningful GMV scale and persistent top placement. A falling product may remain a benchmark, but its action must be `仅作标杆`.

Default benchmark eligibility:

- GMV Top 50 rank is 10 or better.
- `product_id` match is confirmed.
- The product represents a reusable product archetype, not only a brand-specific bundle.

## Growth products

Select exactly six products using:

1. Meaningful current GMV scale.
2. Strong positive GMV change or appearance in the rising list.
3. A clear product pain point or use scenario.
4. Demonstrable content fit.
5. A feasible merchant execution path.

Treat extreme growth cautiously. Mention low-base, new-product, or promotion effects when plausible. Use `小单测试` for promising low-scale rising products.

Use `scripts/score_candidates.mjs` to create the initial shortlist. The model may override the order only with an explicit reason based on execution feasibility or duplicated product archetypes.

Build candidates from the Product-ID-deduplicated union of `GMV Top 50` and
`飙升 Top 50`, not from the rising list alone. When a product appears in both,
use its `GMV Top 50` row as the canonical recommendation evidence. A growth
recommendation must have a real positive GMV change in that canonical row.

The final delivery order is deterministic:

1. Two benchmarks ordered by GMV Top rank ascending.
2. Six growth products ordered by current GMV midpoint descending, then GMV
   change descending, then source rank ascending.

If six eligible growth products cannot be selected, stop with
`recommendation_blocked`. Do not return only benchmarks, use a falling product
as growth, or fill the count with rows whose change is missing.

Do not select near-identical SKUs merely to fill the six growth slots. Keep at
most two examples for one product archetype unless their channel or execution
model is materially different; if this makes the fixed 2+6 set impossible,
return `recommendation_blocked` instead of lowering the standard.

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

## Structured qualitative analysis

Write three short fields per recommended product rather than one blended
paragraph:

1. `insight`: why the product is worth watching, anchored in its scale, growth,
   ticket, TR, and channel structure.
2. `local_context`: a local habit, household/use scenario, weather, season, or
   occasion lens that helps a Chinese merchant understand the market.
3. `execution_advice`: the concrete next action and the most important gate.

Use `推测` for explanations not directly proven by the table.

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

Local context is deliberately lightweight. When search is available, use a
small number of credible local or authoritative sources and set
`local_context_status: searched`; the document labels it `AI搜索分析，仅供参考`.
When search is unavailable, use cautious general knowledge, set
`local_context_status: unverified`, and label it
`AI定性分析，未联网核验，仅供参考`. Zero sources is valid. Never block the report
because an AI cannot search deeply, and never manufacture a seasonal or holiday
link merely to fill the paragraph.

Prefer local explanatory value over broad slogans: typical home size or living
arrangement, pet-care habits, climate and outdoor routines, shopping occasions,
or local compliance/after-sales expectations. Keep it to one compact paragraph.

## Recent market-signal layer

Read `market-signals.md`. This category-level layer is separate from each
product's local-context paragraph. It adds at most three recent demand,
platform, or risk signals only when they map to the requested market and exact
category or a recommended product archetype, have a dated source, and change a
merchant action. Facts come from the source; `why_it_matters` and
`merchant_action` are labeled AI analysis. Never infer that a news item caused
the observed GCRM growth.

Do not block the report when search is unavailable, blocked, or produces zero
relevant signals. Omit the document section rather than padding it with broad
industry growth, company news, or unrelated Amazon rankings.

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
- Exactly two benchmark products.
- Exactly six growth products.
- Seven level-2 category rows maximum.
- No median discussion unless the user explicitly requests it.
- Preserve raw evidence and uncertainty.

## Feishu brief

Use `delivery-manifest.json` as the only source of truth for both final
artifacts. The Feishu Sheet and brief must contain the same ordered two
benchmarks and six growth products and the same `delivery_id`. Do not repeat the
Top 50 table. Put action definitions before product sections, then separate
`标杆品` and `增长品`. Each product is a compact narrative section with image,
core metrics, `为什么值得看`, the labeled local-market paragraph,
`结论与动作`, and one to three material links when available. The complete data
and all valid material links remain in the Sheet. Fetch both outputs and run the
reconciliation and Sheet-delivery validators before exposing either link.

# Recent market signals

This is a lightweight, optional-value layer, not a news digest. The search
attempt is capability-aware; retained signals are optional. Omit the entire
document section when no credible signal survives the relevance gate.

## Search scope

When the host can search, use at most three query families:

1. `<country> + <exact category> + recent news / retail trend`
2. `<locally relevant ecommerce platform> + <category or recommended archetype> + movers / hot list / trend`
3. `<country> + <category or recommended archetype> + season / holiday / regulation / recall`

Use a default recent window of 45 days. A scheduled local event within the next
60 days may be used when it clearly changes merchant timing. Prefer the locally
relevant platform: Amazon is appropriate for US only when the exact category or
recommended archetype can be mapped; do not insert Amazon mechanically into a
SEA report.

## Relevance gate

Keep a signal only when all four conditions are true:

1. It applies to the requested country or market.
2. It maps to the exact category or at least one of the eight recommended
   product archetypes.
3. It has a usable source URL and publication/event date.
4. It changes a merchant action: follow, test, avoid, timing, price, content,
   inventory, or compliance.

Score retained signals from 0 to 6:

- direct category or recommended-product match: +2
- same market and current time window: +1
- changes a concrete merchant action: +2
- official platform, regulator, primary source, or credible trade source: +1

Keep only scores of 4 or higher, at most three signals. Prefer, in order:
government/regulator/recall sources, official platform pages or lists, then
credible local retail/trade reporting.

Exclude generic market-size growth, company earnings or funding, broad consumer
trends with no product mapping, vendor press releases, global news with no local
action, and platform lists that do not match a recommended archetype.

## Output contract

Write `market_context` in `report-spec.json`:

```json
{
  "schema_version": "1.0.0",
  "search_available": true,
  "attempted": true,
  "attempted_at": "2026-08-23T10:30:00+07:00",
  "queries": ["US pet supplies recall August 2026"],
  "status": "completed",
  "signals": [
    {
      "signal_type": "风险信号",
      "title": "Example only",
      "date": "2026-08-20",
      "source_name": "Example source",
      "source_url": "https://example.com/source",
      "relevance_to": ["宠物用品", "g1"],
      "what_changed": "A concise sourced fact.",
      "why_it_matters": "How it maps to the report's category or product.",
      "merchant_action": "The one action that changes.",
      "confidence": "high",
      "relevance_score": 6
    }
  ],
  "blocked_reason": null
}
```

Use `completed` only with one to three retained signals. Use `empty` when search
completed but nothing passed the gate, `unavailable` when the host has no search
capability, and `blocked` when available search failed. The last three statuses
must have an empty `signals` array and do not block the main report.

Run:

```bash
node scripts/validate_market_context.mjs --input "<report-spec.json>"
```

The Feishu document renders this section after `本期结论` only when signals
exist. Clearly label it `AI搜索分析`; distinguish the sourced fact from the AI's
merchant inference and never claim the signal caused the GCRM growth.

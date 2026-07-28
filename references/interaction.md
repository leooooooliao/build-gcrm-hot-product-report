# Interaction contract

## First prompt

Ask only for missing fields. When the category is missing, include the complete category list returned by:

```bash
node scripts/validate_request.mjs --list-options
```

Use one compact message:

> 没问题，我来帮你做一份类目爆品报告。告诉我 3 项信息就行：
> 1）国家：例如 US；东南亚可以选 SEA 汇总，或 TH / ID / VN / PH / MY / SG。
> 2）一级类目：请从下面完整列表中回复一个准确名称。这里使用 GCRM Top Product 当前版本的类目名称（本 Skill 快照：2026-07-28）。
>
> `<category_options_text>`
>
> 3）时间：例如最近30天，或 2026-06-25 至 2026-07-25。

Replace `<category_options_text>` with the full generated text. Never leave the placeholder visible, shorten the list, or substitute a few examples.

## Exact-match response

> 好的，这次看 `<country> × <category> × <start> 至 <end>`。类目按 GCRM Top Product 一级类目版本（快照 `<taxonomy_snapshot>`）执行；我只拉这一份，不扩展到其他国家或类目。

## Alias response

> 你输入的 `<input>` 不是真正的平台类目标签。我理解最接近的是 `<canonical>`。本报告使用 GCRM Top Product 一级类目版本（快照 `<taxonomy_snapshot>`），请确认是否按 `<canonical>` 执行。

## Ambiguous response

> `<input>` 在当前版本里不是唯一类目。最接近的是：`<candidate_1>`、`<candidate_2>`、`<candidate_3>`。请回复其中一个准确名称。
>
> 当前完整一级类目如下：
> `<category_options_text>`

For `家居`, prefer candidates `家居用品`、`家具`、`家纺布艺`; mention `家装建材` when the user's intent is renovation/building materials.

Replace `<category_options_text>` with all current categories returned by the validator.

## SEA response

If the user says only `SEA`:

> 请确认要看 SEA 汇总，还是具体国家：TH / ID / VN / PH / MY / SG？我只拉你确认的一个市场。

## Progress updates

Keep updates short:

1. Filters confirmed.
2. Banners and row counts collected.
3. Images and metrics matched.
4. Excel generated and verified.

Do not narrate browser mechanics unless an interaction failed.

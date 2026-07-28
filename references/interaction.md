# Interaction contract

## First prompt

Use one compact message:

> 请给我 3 项信息：  
> 1）国家：US / GB / DE / FR / IT / ES / IE / JP，或 SEA 汇总；SEA 也可选择 TH / ID / VN / PH / MY / SG。  
> 2）一级类目：必须使用 GCRM Top Product 当前版本的准确类目名称（本 Skill 快照：2026-07-28），例如宠物用品、美妆个护、家居用品、运动与户外。  
> 3）时间周期：例如最近30天，或 2026-06-25 至 2026-07-25。

Ask only for missing fields.

## Exact-match response

> 已确认：`<country> × <category> × <start> 至 <end>`。类目使用 GCRM Top Product 一级类目版本（快照 `<taxonomy_snapshot>`）。我将只拉这一份，不扩展到其他国家或类目。

## Alias response

> 你输入的 `<input>` 不是真正的平台类目标签。我理解最接近的是 `<canonical>`。本报告使用 GCRM Top Product 一级类目版本（快照 `<taxonomy_snapshot>`），请确认是否按 `<canonical>` 执行。

## Ambiguous response

> `<input>` 在当前版本里不是唯一类目。最接近的是：`<candidate_1>`、`<candidate_2>`、`<candidate_3>`。请回复其中一个准确名称。

For `家居`, prefer candidates `家居用品`、`家具`、`家纺布艺`; mention `家装建材` when the user's intent is renovation/building materials.

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


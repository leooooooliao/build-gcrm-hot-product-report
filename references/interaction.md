# Interaction contract

## First response

On the first report interaction, always run:

```bash
node scripts/validate_request.mjs --list-options
```

State that category recognition follows the current Marketing Advisor / GCRM
Top Product level-1 and level-2 taxonomy. Include the complete
`category_options_text` as the level-1 reference list even when the user has
already supplied a category. Ask only for missing fields; the list is guidance,
not an extra confirmation step.

Use this compact template:

> 没问题，我会按营销参谋 GCRM Top Product 当前版本的一级/二级类目来识别（本 Skill 快照：`<taxonomy_snapshot>`）。你可以直接给一级类目，也可以给更精准的二级类目。
>
> 当前完整一级类目如下：
> `<category_options_text>`
>
> 做报告需要 3 项：国家（US；或 SEA / TH / ID / VN / PH / MY / SG）、类目、时间（如最近30天）。`<missing_fields_prompt>`

Replace `<category_options_text>` with every current level-1 category. Never
leave the placeholder visible, shorten the list, or substitute examples.

If all three inputs are present, replace `<missing_fields_prompt>` with “你给的信息已齐，我现在直接校验并开始执行。” Do not wait for another reply.

## Category decision tree

Use this order without exception:

1. Exact level-1 match: execute at level 1 immediately. Do not ask whether the user wants level 2.
2. No level-1 match, but one exact level-2 match: ask once to confirm the full `一级 > 二级` path.
3. No level-1 match, but the level-2 label exists under multiple parents: show every matching full path and ask the user to choose one.
4. No exact level-1 or level-2 match: show at most three close paths, then the complete level-1 list. Never silently map.

An explicitly confirmed full `一级 > 二级` path is valid and must not be asked
about again.

## Exact level-1 response

> 已识别为营销参谋一级类目“`<category>`”，这次按 `<country> × <category> × <start> 至 <end>` 直接执行，不再追问二级类目。

## Exact level-2 confirmation

> 你输入的“`<input>`”不是一级类目；在当前二级类目中匹配到“`<level_1> > <level_2>`”。请确认是否按这个二级类目执行。

After confirmation, continue immediately and pass the full breadcrumb to the
validator and filter-plan builder.

## Ambiguous level-2 response

> 二级类目“`<input>`”存在多个路径：`<path_1>`、`<path_2>`。请回复一个完整路径，我会只按该二级类目执行。

## Alias or invalid response

For a level-1 alias:

> 你输入的“`<input>`”不是平台的准确一级类目标签；最接近“`<canonical>`”。请确认是否按这个一级类目执行。

For an invalid category:

> “`<input>`”不在当前版本的一、二级类目中。最接近的是：`<candidate_1>`、`<candidate_2>`、`<candidate_3>`。请回复一个准确名称或完整路径。
>
> 当前完整一级类目如下：
> `<category_options_text>`

For `家居`, prefer `家居用品`、`家具`、`家纺布艺`; mention `家装建材` when
the intent is renovation/building materials.

## SEA response

If the user says only `SEA`:

> 请确认要看 SEA 汇总，还是具体国家：TH / ID / VN / PH / MY / SG？我只拉你确认的一个市场。

## Progress updates

Keep updates short:

1. Filters confirmed.
2. Banners and row counts collected.
3. Images, average price, ads cost, midpoint TR, and channel metrics matched.
4. Recent market check completed; retain only locally relevant signals that
   change a merchant action, or omit the section.
5. Creative-query capability checked; use `crm-data-query` first when available,
   then report completed, empty, or blocked status without stopping the main report.
6. Feishu Sheet created, read back, and validated; then the concise Feishu
   recommendation document is generated and both artifacts are reconciled.

Do not narrate browser mechanics unless an interaction failed.

## Final handoff navigation

Do not finish by sending two unexplained links. Immediately after the Feishu
document and Sheet links, add a compact `这两份交付物怎么用` section so the
recipient can navigate the report without exploring it first.

Explain the Feishu recommendation document:

- `本期结论`: the three decisions that should be read first.
- `近期市场信号`（有符合条件的信号时才出现）: dated local demand, platform,
  or risk information that changes a merchant action.
- `动作标签怎么理解`: the difference between 快速跟进、条件跟进、小单测试、
  and 仅作标杆.
- `标杆品`: mature high-scale products to learn from, not automatic sourcing
  recommendations.
- `增长品`: products with current growth signals, including why they matter,
  local-market context, execution advice, and selected material links.
- `完整数据与素材`: the entry point to the full Sheet.

Then explain every delivered Sheet tab:

- `结论`: the condensed 2+6 recommendations and category opportunity view.
- `选品池`: the Product-ID-deduplicated GMV/rising candidate pool; the first
  eight rows are the official recommendation set.
- `Top50原始榜单`: the auditable rows and source metrics from the four banners.
- `使用说明`: metric formulas, interval caveats, and action-label definitions.
- `素材链接`: up to five valid links for each recommended product, or an explicit
  completed-empty/blocked status when links were unavailable.

An absent `素材链接` tab means the delivery is incomplete; repair it before
handoff. Keep the navigation explanation concise and put it before the final
merchant takeaways or validation details.

Use this compact shape:

> **这两份交付物怎么用**
>
> - 飞书文档：先看本期结论；若有“近期市场信号”，再看哪些当地事件、平台
>   或风险信息会改变动作；随后按标杆品/增长品阅读推荐，文末进入完整数据。
> - 飞书电子表格：结论看最终推荐，选品池看候选商品，Top50原始榜单做
>   数据复核，使用说明查口径；素材链接页保留推荐商品的素材或查询状态。

Do not omit the material tab from a complete delivery.

## Browser recovery messages

If local browser control is not enabled, ask for one action only:

> 我还需要操作你当前已登录的本地浏览器。请开启当前 AI 的浏览器/Chrome 操作能力；开启后我会继续完成筛选和采集，不需要你逐项代点。

If the GCRM session is logged out, ask for one action only:

> 当前 GCRM 登录已失效。请在本地浏览器完成登录；登录后我会从筛选步骤继续，不需要你手动切换国家、类目或榜单。

Never ask the user to scroll a dropdown, expand SEA or a category parent,
select an offscreen category, or page through Top 50. After all automated
recovery paths fail, explain the capability blocker and return only verified
partial data.

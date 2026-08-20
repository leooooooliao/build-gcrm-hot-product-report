# 类目爆品报告 Skill

把营销参谋 GCRM Top Product 榜单转成一份可复核、可直接给销售或商家使用的选品报告。用户只需要提供国家、类目和时间，AI 会完成筛选、采集、指标计算、爆品判断以及飞书交付。

> 📘 **[查看完整图文使用 SOP：安装、调用、采集、交付与问题复盘](https://bytedance.larkoffice.com/wiki/WYrhwXnaFib8pNkkOCWcfVvxnZd)**
>
> 该文档包含逐步截图，需要使用有权限的字节飞书账号访问。

## 为什么需要这个 Skill

营销参谋的原始导出可以保留商品图片和基础信息，但部分关键经营指标并不完整；纯手工复制又容易在日期、筛选口径、GMV 区间换算和跨榜单 Product ID 匹配中出错。

这个 Skill 将整条流程固定下来：

1. 校验国家、营销参谋一级/二级类目和日期区间。
2. 在用户已经登录的 GCRM 页面内完成筛选。
3. 采集 GMV、销量、广告消耗和飙升榜 Top 50。
4. 保留网页区间值，计算客单价、TR（估）及直播/短视频 GMV 占比。
5. 生成固定顺序的 2 个标杆品 + 6 个增长品，并给出数据判断、本地市场/季节视角和执行建议。
6. 先交付并回读完整飞书表格，再生成精简飞书推荐文档，最后完成一致性对账。

## 最简调用方式

直接用自然语言告诉 AI 三项信息即可：

```text
帮我做一份类目爆品报告：国家 US，类目宠物用品，时间最近30天。
```

类目识别以营销参谋 GCRM Top Product 当前版本的一级/二级类目为准。输入准确的一级类目时直接执行；输入更具体的二级类目或近似词时，AI 会按既定规则校验或让用户确认，不会静默映射。

## 交付内容

### 飞书电子表格

- `结论`：本期判断、2 个标杆品、6 个增长品和类目机会。
- `选品池`：GMV Top 50 与飙升 Top 50 按 Product ID 去重后的候选集合。
- `Top50原始榜单`：四个榜单的完整证据和计算辅助列。
- `使用说明`：指标口径、推荐标签定义与审计说明。
- `素材链接`：执行素材查询时出现；每个推荐品最多保留 5 条有效链接，0 条也会明确标注且不补查。

核心四张表必须存在，允许追加合理辅助表。表头按机器合同固定，GMV
区间、GMV 变化等不同指标永远拆成不同单元格，避免直接照抄网页的
“上半格区间、下半格增速”。

### 飞书推荐文档

只保留国家、类目、周期、三条核心判断和同一组 2+6 推荐商品。动作标签
前置，商品按“标杆品 / 增长品”分段，每品附图片、核心指标、为什么值得看、
本地市场与季节补充、结论与动作以及 1–3 条参考素材。所有完整数据和有效
素材链接仍在飞书电子表格中。

两份交付物使用同一个 `delivery_id`。商品、顺序、来源榜单或关键指标存在任何差异时，Skill 必须先修复并重新校验，不能直接把不一致的链接交给用户。

## 安装

本仓库公开，但 GCRM 页面和上方飞书 SOP 仍需要对应公司权限。Skill 不限定 Codex；只要 AI 产品支持 Skill、Project Instructions、Agent Rules 或类似扩展机制，并具备本地浏览器及飞书操作能力，即可按其自身机制安装。

可以把下面这段话直接发给 AI：

```text
请从 https://github.com/leooooooliao/build-gcrm-hot-product-report/releases/latest 下载 build-gcrm-hot-product-report.zip，并校验同版本的 SHA-256 文件。请先识别你当前平台支持的是 Skill、Project Instructions、Agent Rules 还是其他扩展机制，再把完整工具包安装到正确位置，不要默认按 Codex 处理。安装完成后，请告诉我以后需要怎样调用，以及必须提供哪些输入信息。
```

安装和更新都必须使用 [最新稳定 Release](https://github.com/leooooooliao/build-gcrm-hot-product-report/releases/latest) 中的 ZIP 附件，不要使用分支源码、PR 或零散 Raw 文件。

## 权限与合规边界

- Skill 只在用户已经授权的浏览器和飞书环境内工作，不会绕过公司登录或访问权限。
- 不要向 AI 提供密码、Cookie、访问令牌或验证码。
- 登录失效时，用户只需在本地重新登录；AI 应从中断的筛选步骤继续。
- 模糊经营数据保留网页展示区间；区间中点只用于 TR 和渠道占比等估算。
- GCRM 内部入口：[Marketing Advisor / Top Product](https://mmm.tiktok-row.net/gcrm_overseas/phoenix/marketing-advisor/product-insights/top-product)。

## 自动更新与下载统计

从 v1.4.0 起，Skill 每次调用都会检查本仓库的最新稳定 Release，并在校验完整 ZIP 和 SHA-256 后安全更新。GitHub Release 中 ZIP 附件的 `download_count` 用作安装与更新次数的近似统计；它包含重复下载和版本更新，因此不等于独立用户数。校验文件下载不计入该统计口径。

查看全部版本和附件：[Releases](https://github.com/leooooooliao/build-gcrm-hot-product-report/releases)。

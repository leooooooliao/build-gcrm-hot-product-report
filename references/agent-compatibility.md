# Agent compatibility

## Natural invocation

The user-facing name is `类目爆品报告`. Do not require users to type the machine identifier.

Preferred request:

> 帮我做一份类目爆品报告吧：国家是 US，类目是宠物用品，时间看最近30天。

If the host supports explicit skill identifiers, `$build-gcrm-hot-product-report` remains valid.

## Detect the host before installation

1. If the host supports installable skill folders, install the complete `build-gcrm-hot-product-report` directory in that host's documented skills directory.
2. If the host supports project instructions but not skills, use `SKILL.md` as the project/runbook instruction and keep `references/` and `scripts/` beside it.
3. If the host is a chat-only interface with no authenticated browser or file tools, do not claim the full workflow is installed. Explain that it can analyze uploaded exports but cannot independently open GCRM or generate the verified workbook.

Do not assume every user runs Codex. Do not instruct a non-Codex user to use `$CODEX_HOME` unless that environment actually exists.

## Runtime capability

Preferred path:

- Node.js
- `@oai/artifact-tool`
- `sharp`
- authenticated browser access to GCRM

Portable path:

- Use the host's native browser and spreadsheet tooling.
- Preserve the same JSON contract, four-sheet workbook structure, formulas, styling, image policy, and verification requirements.
- Keep the deterministic validation and scoring scripts when Node.js is available.

If the host lacks `@oai/artifact-tool`, it may use an equivalent XLSX-capable tool permitted by that environment. It must still render or open every sheet for visual QA and scan formulas for errors.

## Browser capability

Read `references/browser-runbook.md` before live collection and run
`scripts/build_filter_plan.mjs` for the confirmed country and category.

- `get_tabs` or opening the page only proves discovery, not completed filtering.
- Country and Category are custom TreeSelect/Cascader controls; do not use a
  native `<select>` command.
- Prefer exact DOM locators, which can auto-scroll inside an open overlay.
- A visual-only fallback must scroll the dropdown overlay, not the page body.
- For SEA child countries, expand SEA and take a fresh snapshot before retrying.
- Prefer XHR/API, export, or pagination over visually scrolling 50 table rows.

The user may be asked once for browser permission or login. Do not ask the user
to manually scroll or repeatedly switch country, category, banner, or page. If
the host cannot complete those actions, return a clearly marked partial result
instead of claiming no data.

## Access boundary

The GitHub repository may be public, but the GCRM source page remains access-controlled. Public access to the skill does not grant access to company data. Never request or store a user's company password, cookies, or session tokens.

## Platform-neutral installation prompt

Use this prompt:

> 请从 GitHub Release 下载并安装“类目爆品报告”工具包。先识别你当前支持的是 Skill、Project Instructions、Agent Rules 还是其他扩展机制，再放到对应位置；不要默认我是 Codex 用户。如果当前平台不能安装目录型 Skill，就把 SKILL.md 作为项目指令，并保留 scripts 与 references 的相对目录。安装后请说明实际采用的安装方式、可用能力和限制，不要声称获得了 GCRM 权限。

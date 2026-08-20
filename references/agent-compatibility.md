# Agent compatibility

## Natural invocation

The user-facing name is `类目爆品报告`. Do not require users to type the machine identifier.

Preferred request:

> 使用CNOB Skill，帮我做一份类目爆品报告：国家 US，类目宠物用品，时间最近30天。

Prefer this exact public wording while keeping older natural-language requests
and `$build-gcrm-hot-product-report` compatible.

On the first interaction, state that categories follow the current Marketing
Advisor / GCRM Top Product level-1 and level-2 taxonomy and enumerate the full
level-1 list. Exact level-1 input runs immediately; only an input that misses
level 1 but matches level 2 requires one full-path confirmation.

If the host supports explicit skill identifiers, `$build-gcrm-hot-product-report` remains valid.

## Detect the host before installation

1. If the host supports installable skill folders, install the complete `build-gcrm-hot-product-report` directory in that host's documented skills directory.
2. If the host supports project instructions but not skills, use `SKILL.md` as the project/runbook instruction and keep `references/` and `scripts/` beside it.
3. If the host is a chat-only interface with no authenticated browser or file tools, do not claim the full workflow is installed. Explain that it can analyze uploaded exports but cannot independently open GCRM or generate the verified Feishu deliverables.

Do not assume every user runs Codex. Do not instruct a non-Codex user to use `$CODEX_HOME` unless that environment actually exists.

## Stable updates

At the start of each invocation, run `scripts/check_for_updates.mjs`. Read
`references/update-runbook.md` only when an update is available.

- Use the platform's native Skill/extension updater when available.
- Use only the configured repository's latest stable GitHub Release.
- Download the Release ZIP asset even on the first installation; do not install
  via clone, source archive, or individually fetched raw files.
- Require the matching SHA-256 asset before replacing an installed package.
- Re-read the updated `SKILL.md` and resume the original request.
- Do not recursively check again in the same request.
- Treat an offline or rate-limited check as non-blocking.

On chat-only platforms that cannot execute the checker, compare the installed
version in `references/release.json` with the repository's latest stable Release.
If the platform also cannot update files, provide the Release link once and
continue with the installed version.

## Runtime capability

Preferred path:

- Node.js
- `@oai/artifact-tool` when a verified XLSX transfer artifact is needed
- `sharp`
- authenticated browser access to GCRM
- authenticated Feishu/Lark Sheets and document write access

Portable path:

- Use the host's native browser and spreadsheet tooling.
- Preserve the same JSON contract, four core Feishu Sheet tabs, conditional
  `素材链接` tab, atomic header contract, formulas, styling, image policy, and
  verification requirements.
- Preserve the displayed average price, midpoint-estimated TR, single
  action-label system, structured local-market analysis, and concise narrative
  Feishu-brief contract.
- Keep the deterministic validation and scoring scripts when Node.js is available.

If the host lacks `@oai/artifact-tool`, it may create the online Feishu Sheet
directly with typed data and native styles. If it uses an XLSX transfer artifact,
it must import it with the native Feishu workbook-import operation, then read the
online result back and repair any style or image drift with native Sheet tools.

If the host cannot write Feishu Sheets or documents, it must still generate the
verified XLSX and portable XML brief, report the limitation clearly, and never
pretend that a live artifact was created.

## Browser capability

Read `references/browser-runbook.md` before live collection and run
`scripts/build_filter_plan.mjs` for the confirmed country and category.

- `get_tabs` or opening the page only proves discovery, not completed filtering.
- Country and Category are custom TreeSelect/Cascader controls; do not use a
  native `<select>` command.
- Prefer exact DOM locators, which can auto-scroll inside an open overlay.
- A visual-only fallback must scroll the dropdown overlay, not the page body.
- For SEA child countries, expand SEA and take a fresh snapshot before retrying.
- For a level-2 category, click the parent row body to expand it, never the
  parent checkbox; refresh the snapshot, select only the exact child checkbox,
  and verify the parent remains unchecked.
- Prefer XHR/API, export, or pagination over visually scrolling 50 table rows.

The user may be asked once for browser permission or login. Do not ask the user
to manually scroll or repeatedly switch country, category, banner, or page. If
the host cannot complete those actions, return a clearly marked partial result
instead of claiming no data.

## Access boundary

The GitHub repository may be public, but the GCRM source page remains access-controlled. Public access to the skill does not grant access to company data. Never request or store a user's company password, cookies, or session tokens.

## Platform-neutral installation prompt

Use this prompt:

> 请安装“类目爆品报告”：先访问 `https://api.github.com/repos/leooooooliao/build-gcrm-hot-product-report/releases/latest`，从返回的 assets 中下载 `build-gcrm-hot-product-report.zip` 和同名 `.sha256`。必须通过 ZIP 的 `browser_download_url` 下载一次，不要用 git clone、GitHub 源码包或逐个 raw 文件替代；校验 SHA-256 后解压。再识别你当前支持的是 Skill、Project Instructions、Agent Rules 还是其他扩展机制，把完整的 `build-gcrm-hot-product-report` 目录放到对应位置；不要默认我是 Codex 用户。如果当前平台不能安装目录型 Skill，就把 `SKILL.md` 作为项目指令，并保持 `scripts/` 与 `references/` 的相对目录不变。安装后请告诉我实际采用的安装方式，并明确提示以后这样调用：`使用CNOB Skill，帮我做一份类目爆品报告：国家 <国家>，类目 <GCRM一级或二级类目>，时间 <日期范围>。`不要声称安装本身获得了 GCRM 或飞书权限。

The ZIP asset download is counted automatically by GitHub. No user form or
manual installation report is required. The metric includes first installs and
updates and must not be described as unique users.

# Data-query routing

Choose the acquisition route before opening a source. Do not use one browser
workflow for every internal page.

## Source routing

| Source | Preferred route | Fallback |
|---|---|---|
| GCRM Top Product | Authenticated browser, XHR/API, export or structured DOM | Verified partial result |
| MMM Analytics / BI dashboard | `crm-data-query` when the host exposes it | Authenticated browser |
| Public recent market information | Host web/search capability | Omit the market-signal section |

`crm-data-query` does not currently support the GCRM Top Product collection in
this Skill. Do not force it onto that source. Re-check this boundary in a future
Skill update rather than silently changing the route.

## Capability preflight

Before every MMM Analytics / BI dashboard query:

1. Inspect the current host's tools, assistants or installed capabilities for an
   exact `crm-data-query` data-query function.
2. Record whether it is available. Discovery is not a query attempt.
3. If available, the actual query instruction must begin with the literal text
   `用crm-data-query取数：<dashboard URL>`.
4. Validate the returned filter values and rows before using them.
5. If the first query fails, retry once with the same explicit filters. If it
   still fails, use the previous authenticated-browser route and record the
   fallback reason.
6. If the capability is absent, use the browser route immediately. Do not block
   the report merely because one host lacks the preferred query function.

## Creative-dashboard instruction

Use one prompt per batch, at most two batches and at most five Product IDs per
batch. Replace the placeholders but keep the wording explicit:

> 用crm-data-query取数：https://mmm.tiktok-row.net/apps/analytics/biportal/report/edit/1361187
> 请先设置 Pdate=`<start>`至`<end>`，再设置 Ecommerce Product ID=`<up to 5 Product IDs>`；只返回这些 Product ID，按 Dollar Revenue 降序。字段至少包含 Ecommerce Product ID、Dollar Revenue、URL。URL 为 NULL 的行不要计入，每个商品最多保留 5 条。

Never filter this board by Shop Name. Do not open individual creative URLs merely
to collect links.

## Result validation

Before accepting a dashboard result, require all of the following:

- the returned or echoed period matches the requested `Pdate`, allowing the
  already-approved one-to-two-day difference from GCRM;
- returned Product IDs are a subset of the requested batch;
- `Ecommerce Product ID`, `Dollar Revenue`, and `URL` are present;
- NULL URLs are removed;
- rows are sorted by Dollar Revenue and capped at five per product;
- all eight manifest Product IDs have a final count, including zero.

Store the capability check, literal prompts, route, and fallback reason in
`creative-links.json`. `scripts/validate_creative_links.mjs` rejects a delivery
that skips `crm-data-query` when it was available.

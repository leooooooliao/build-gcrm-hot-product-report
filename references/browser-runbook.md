# GCRM browser runbook

Use this runbook when collecting live data from GCRM. It is intentionally
platform-neutral: use the host's local-browser, Chrome, Playwright, or equivalent
tool, but keep the same authenticated session and completion checks.

## Hard boundary

- The user may be asked once to enable browser control or log in.
- Never ask the user to scroll a dropdown, expand SEA, or select each country,
  category, banner, or page for the agent.
- A click is not proof of success. Re-read the visible filters and result rows.
- A failed filter operation is `collection_blocked`, not “no data”.

If the host cannot control an authenticated browser, use a user-provided export
as a partial source and state which live fields cannot be verified.

## Build the deterministic filter plan

After request validation, run:

```bash
node scripts/build_filter_plan.mjs \
  --country "<confirmed country>" \
  --category "<exact level-1 category or confirmed level-1 > level-2 path>"
```

Use the returned URL, selectors, operation order, and completion checks. Do not
guess selectors when a current plan is available.

## Set and verify filters

1. Open `country_selection.direct_url`. Set the country before category and
   dates because changing region may reset the other filters.
2. Re-read the visible Country value. If the direct URL does not work, open the
   custom Country TreeSelect and use the exact option selector.
3. For TH / ID / VN / PH / MY / SG, if the target option is absent, expand SEA,
   take a fresh full DOM snapshot, and locate the child country again.
4. Open Category with `category_selection.trigger_selector`, then take a fresh
   full DOM snapshot. The Cascader overlay may be mounted outside the trigger.
5. Clear other checked category rows. If the requested category is level 1,
   click only its checkbox child. Do not ask whether the user wants level 2.
6. If the requested category is level 2, follow this fixed sequence:
   - click the exact parent level-1 row body to expand it; do **not** click the
     parent checkbox;
   - take a fresh full DOM snapshot after the second menu appears;
   - locate the exact level-2 row in the second menu and click its checkbox
     child;
   - verify the parent remains `aria-checked="false"` and the target child is
     `aria-checked="true"`.
7. If the parent was accidentally selected, clear its checkbox, re-expand the
   parent, refresh the snapshot, and select only the child. Never continue with
   both parent and child selected.
8. Set the exact start and end dates, save, and wait for loading to finish.
9. Verify the visible country, the single intended category, exact dates, and
   numeric ranking rows.

For a level-1 request, the only checked category row must be that level-1 row.
For a level-2 request, the only checked category row must be that level-2 row;
its level-1 parent must stay unchecked. An overflow value of `+1` or higher
means the filter is invalid.

## Handle offscreen and virtualized options

Use this order:

1. Click the exact DOM selector. A capable locator scrolls the target into view
   inside the open overlay.
2. Refresh the DOM snapshot and try the strict selector again.
3. Use the fallback category selector only when it matches exactly one element
   in the intended menu. A duplicate label outside the intended parent is not a
   valid match.
4. If visual scrolling is required, place the pointer inside the visible
   TreeSelect or Cascader menu and scroll that overlay only.

Do not scroll the page body to reveal an option inside a portal or virtual list.
Do not conclude that an option is unavailable merely because it is outside the
current screenshot.

## Collect Top 50 without visual row-by-row scrolling

For each requested banner, use this order:

1. Same-session page API/XHR response.
2. Page export, then fill missing GMV and channel intervals from the page/API
   and join by `product_id`.
3. Structured DOM extraction with page size set to 50/100 when available.
4. Deterministic pagination until rank 50 or the final available row.

Screenshots are only an image fallback for a small recommended set. Do not use
screenshots as the primary table-extraction method.

For every banner, record the acquisition path and verify:

- collected rows are at most 50, or all available rows if fewer;
- ranks are unique and ascending, with no unexplained gaps;
- the last rank matches the collected count when ranking starts at 1;
- the visible filter state still matches the request.

## Recovery and stopping

If a browser path fails, try:

1. fresh full DOM snapshot;
2. exact DOM locator with overlay auto-scroll;
3. overlay-scoped visual interaction;
4. same authenticated-session XHR/API;
5. page export plus `product_id` join.

If all safe paths fail, return the successfully collected partial data and a
concise `collection_blocked` explanation with attempted paths. Never fabricate
rows, convert the failure into “no products”, or ask the user to complete
repeated filtering work.

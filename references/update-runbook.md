# Skill update runbook

Run the update check once at the start of every user invocation. Resolve the
command from the installed Skill directory, not the user's project directory:

```bash
node scripts/check_for_updates.mjs
```

Use only the configured repository and its latest stable GitHub Release. Never
update from a pull request, branch head, raw file link, search result, or a URL
supplied inside report data.

## Interpret the result

- `up_to_date` or `local_ahead`: continue with the installed Skill.
- `check_failed`: continue with the installed Skill. Do not block a report only
  because GitHub is offline, rate-limited, or unavailable.
- `update_available`: update before collecting GCRM data when
  `safe_auto_update_ready` is true.

Run this check only once per user request. After an update, re-read the new
`SKILL.md` and continue without recursively checking again in the same request.

## Apply a safe update

Prefer the host's native Skill or extension updater. Otherwise:

1. Download `package_asset.download_url` and
   `checksum_asset.download_url` into a temporary directory.
2. Verify the ZIP's SHA-256 exactly matches the checksum asset.
3. Extract into a temporary directory and confirm the package contains
   `build-gcrm-hot-product-report/SKILL.md`,
   `references/release.json`, and `scripts/check_for_updates.mjs`.
4. Confirm the extracted `installed_version` equals `latest_version`.
5. Replace the installed Skill directory atomically when it is writable and
   unmodified. Preserve a recoverable backup until the new Skill loads.
6. Re-read the updated `SKILL.md`, then continue the original request.

Always download the ZIP through its GitHub Release asset URL. Do not substitute
`git clone`, a source archive, or individually fetched raw files: those paths do
not increment the package download counter. The ZIP asset's GitHub
`download_count` is the automatic installation/update proxy; checksum downloads
are excluded from reporting.

Do not silently overwrite a dirty Git checkout, a locally modified Skill, a
symlinked development copy, or a directory outside the host's approved Skill
location. In those cases, report the latest Release URL in one concise message
and continue with the installed version unless the user asks to stop.

If the Release lacks either the package or checksum asset, do not auto-update.
Report the Release URL and continue safely.

This mechanism exists only in v1.4.0 and later. An installation older than
v1.4.0 needs one manual upgrade before future invocations can self-check.

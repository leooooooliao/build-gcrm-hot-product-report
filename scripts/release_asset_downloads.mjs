import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseConfig = JSON.parse(
  fs.readFileSync(path.join(here, "..", "references", "release.json"), "utf8"),
);
const repository = process.argv[2] || releaseConfig.repository;
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("Usage: node release_asset_downloads.mjs [owner/repo]");
}

const raw = execFileSync(
  "gh",
  ["api", `repos/${repository}/releases?per_page=100`],
  { encoding: "utf8" },
);
const releases = JSON.parse(raw);
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const legacyPackage = new RegExp(
  `^${escapeRegExp(releaseConfig.release_asset_prefix)}v\\d+\\.\\d+\\.\\d+\\.zip$`,
);
const rows = releases.flatMap((release) =>
  (release.assets || []).map((asset) => ({
    release: release.tag_name,
    asset: asset.name,
    downloads: asset.download_count,
    published_at: release.published_at,
    url: asset.browser_download_url,
  })),
).filter((row) =>
  row.asset === releaseConfig.release_asset_name || legacyPackage.test(row.asset)
);

console.log(JSON.stringify({
  repository,
  total_package_downloads: rows.reduce((sum, row) => sum + row.downloads, 0),
  package_assets: rows,
  excluded_assets: "SHA-256 checksum downloads are excluded so one installation is not counted twice.",
  note: "This is the cumulative GitHub Release ZIP download count. It includes first installs and later updates, repeated downloads, and is not a unique-user count.",
}, null, 2));

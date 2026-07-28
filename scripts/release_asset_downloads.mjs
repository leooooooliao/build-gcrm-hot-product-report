import { execFileSync } from "node:child_process";

const repository = process.argv[2];
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("Usage: node release_asset_downloads.mjs <owner/repo>");
}

const raw = execFileSync(
  "gh",
  ["api", `repos/${repository}/releases?per_page=100`],
  { encoding: "utf8" },
);
const releases = JSON.parse(raw);
const rows = releases.flatMap((release) =>
  (release.assets || []).map((asset) => ({
    release: release.tag_name,
    asset: asset.name,
    downloads: asset.download_count,
    published_at: release.published_at,
    url: asset.browser_download_url,
  })),
);

console.log(JSON.stringify({
  repository,
  total_release_asset_downloads: rows.reduce((sum, row) => sum + row.downloads, 0),
  assets: rows,
  note: "Only GitHub Release asset downloads are cumulative. Repository views/clones are separate rolling traffic metrics.",
}, null, 2));

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseConfig = JSON.parse(
  await fs.readFile(
    path.join(here, "..", "references", "release.json"),
    "utf8",
  ),
);

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${token} 缺少值。`);
    }
    result[token.slice(2)] = value.trim();
    index += 1;
  }
  return result;
}

function parseVersion(value) {
  const match = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`不支持的版本格式：${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function findAsset(release, name) {
  return release.assets?.find((asset) => asset.name === name) ?? null;
}

async function check() {
  const args = argsOf(process.argv.slice(2));
  const installedVersion =
    args["current-version"] || releaseConfig.installed_version;
  parseVersion(installedVersion);

  const timeoutMs = Number(args["timeout-ms"] || 8000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("--timeout-ms 必须在 1000 至 30000 之间。");
  }

  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(releaseConfig.latest_release_api, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `build-gcrm-hot-product-report/${installedVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} ${response.statusText}`);
    }

    const release = await response.json();
    const latestVersion = String(release.tag_name ?? "").replace(/^v/, "");
    parseVersion(latestVersion);

    const comparison = compareVersions(installedVersion, latestVersion);
    const state = comparison < 0
      ? "update_available"
      : comparison > 0
        ? "local_ahead"
        : "up_to_date";
    const tag = `v${latestVersion}`;
    const packageName =
      `${releaseConfig.release_asset_prefix}${tag}.zip`;
    const checksumName = `${packageName}.sha256`;
    const packageAsset = findAsset(release, packageName);
    const checksumAsset = findAsset(release, checksumName);

    return {
      state,
      checked_at: checkedAt,
      repository: releaseConfig.repository,
      installed_version: installedVersion,
      latest_version: latestVersion,
      release_tag: release.tag_name,
      release_url: release.html_url,
      package_asset: packageAsset
        ? {
            name: packageAsset.name,
            download_url: packageAsset.browser_download_url,
          }
        : null,
      checksum_asset: checksumAsset
        ? {
            name: checksumAsset.name,
            download_url: checksumAsset.browser_download_url,
          }
        : null,
      safe_auto_update_ready:
        state === "update_available" && Boolean(packageAsset && checksumAsset),
      policy:
        "Update only from this repository's latest stable GitHub Release and verify the SHA-256 asset before replacement.",
    };
  } catch (error) {
    return {
      state: "check_failed",
      checked_at: checkedAt,
      repository: releaseConfig.repository,
      installed_version: installedVersion,
      repository_url: releaseConfig.repository_url,
      reason: error.message,
      blocking: false,
    };
  }
}

try {
  const result = await check();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

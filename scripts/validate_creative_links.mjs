import fs from "node:fs/promises";
import path from "node:path";
import { validateCreativeLinks } from "./creative_contract.mjs";

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    result[argv[index].slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return result;
}

const args = argsOf(process.argv.slice(2));
if (!args.input || !args.manifest) {
  throw new Error("Usage: node validate_creative_links.mjs --input creative-links.json --manifest delivery-manifest.json");
}

const [record, manifest] = await Promise.all([
  fs.readFile(path.resolve(args.input), "utf8").then(JSON.parse),
  fs.readFile(path.resolve(args.manifest), "utf8").then(JSON.parse),
]);
const result = validateCreativeLinks(record, manifest.recommendation_ids);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.valid) process.exitCode = 1;

import fs from "node:fs/promises";
import path from "node:path";
import { validateMarketContext } from "./market_context_contract.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, items) => {
  if (item.startsWith("--")) pairs.push([item.slice(2), items[index + 1] || ""]);
  return pairs;
}, []));

if (!args.input) {
  throw new Error("Usage: node validate_market_context.mjs --input report-spec.json");
}

const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const result = validateMarketContext(spec.market_context);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.valid) process.exitCode = 1;

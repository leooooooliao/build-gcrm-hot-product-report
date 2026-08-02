import fs from "node:fs/promises";
import path from "node:path";
import { buildDeliveryManifest } from "./delivery_contract.mjs";

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
if (!args.input || !args.output) {
  throw new Error("Usage: node build_delivery_manifest.mjs --input report-spec.json --output delivery-manifest.json");
}
const spec = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const manifest = buildDeliveryManifest(spec);
await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await fs.writeFile(path.resolve(args.output), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  valid: true,
  output: path.resolve(args.output),
  delivery_id: manifest.delivery_id,
  recommendation_count: manifest.recommendations.length,
  recommendation_ids: manifest.recommendation_ids,
}, null, 2)}\n`);

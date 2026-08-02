import fs from "node:fs/promises";
import path from "node:path";
import { reconcileDelivery } from "./delivery_contract.mjs";

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
if (!args.manifest || !args.sheet || !args.brief) {
  throw new Error("Usage: node reconcile_delivery.mjs --manifest delivery-manifest.json --sheet sheet-readback.json --brief brief-readback.json");
}
const [manifest, sheetReadback, briefReadback] = await Promise.all([
  fs.readFile(path.resolve(args.manifest), "utf8").then(JSON.parse),
  fs.readFile(path.resolve(args.sheet), "utf8").then(JSON.parse),
  fs.readFile(path.resolve(args.brief), "utf8").then(JSON.parse),
]);
const result = reconcileDelivery(manifest, sheetReadback, briefReadback);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.valid) process.exitCode = 1;

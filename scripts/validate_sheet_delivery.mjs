import fs from "node:fs/promises";
import path from "node:path";
import { SHEET_CONTRACT, validateSheetDelivery } from "./sheet_contract.mjs";

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    if (key === "print-contract") {
      result[key] = true;
      continue;
    }
    result[key] = argv[index + 1] ?? "";
    index += 1;
  }
  return result;
}

const args = argsOf(process.argv.slice(2));
if (args["print-contract"]) {
  process.stdout.write(`${JSON.stringify(SHEET_CONTRACT, null, 2)}\n`);
  process.exit(0);
}
if (!args.input) {
  throw new Error("Usage: node validate_sheet_delivery.mjs --input sheet-readback.json | --print-contract");
}

const readback = JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"));
const result = validateSheetDelivery(readback);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.valid) process.exitCode = 1;

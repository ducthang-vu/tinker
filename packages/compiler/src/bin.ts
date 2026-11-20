#!/usr/bin/env node
// The command: `tinker-check [--strict] <file.ts>...`. See check.ts.

import { checkFiles } from "./check.ts";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const files = args.filter((arg) => arg !== "--strict");
const output = {
  log: (line: string) => console.log(line),
  error: (line: string) => console.error(line),
};
process.exitCode = await checkFiles(files, { strict }, output);

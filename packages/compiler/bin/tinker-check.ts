#!/usr/bin/env node
// The command: `tinker-check [--strict] <file.ts>...`. See src/check.ts. It lives outside
// src/: its only work is reading the arguments and setting the exit code, so it is not
// measured for coverage, and check.ts, which does the work, is tested in full.

import { checkFiles } from "../src/check.ts";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const files = args.filter((arg) => arg !== "--strict");
const output = {
  log: (line: string) => console.log(line),
  error: (line: string) => console.error(line),
};
process.exitCode = await checkFiles(files, { strict }, output);

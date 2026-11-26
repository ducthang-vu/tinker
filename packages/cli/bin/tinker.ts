#!/usr/bin/env node
// The command: `tinker new <name> [--dir <parent>]`. See src/cli.ts.

import { run } from "../src/cli.ts";

process.exitCode = run(process.argv.slice(2), {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});

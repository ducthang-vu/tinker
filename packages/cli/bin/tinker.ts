#!/usr/bin/env node
// The command: `tinker new | dev | build`. See src/cli.ts.

import { run } from "../src/cli.ts";

process.exitCode = await run(process.argv.slice(2), {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});

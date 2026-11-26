#!/usr/bin/env node
// The command: `tinker-compile --out <dir> <file.ts>...`. See src/emit-files.ts.
// It lives outside src/ for the same reason as tinker-check (see bin/tinker-check.ts).

import { emitFiles, parseArguments } from "../src/emit-files.ts";

try {
  const options = parseArguments(process.argv.slice(2));
  process.exitCode = await emitFiles(options, {
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 2;
}

// The command: `tinker-types <file-or-folder>...` writes the type check files of the templates in
// the given files, or under the given folders. See src/types/write-checks.ts. Its only work is
// reading the arguments and setting the exit code, so it is not measured for coverage.

import { sourceFilesUnder, writeChecks } from "../src/types/write-checks.ts";

const output = {
  log: (line: string) => console.log(line),
  error: (line: string) => console.error(line),
};
process.exitCode = await writeChecks(sourceFilesUnder(process.argv.slice(2)), output);

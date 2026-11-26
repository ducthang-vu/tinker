// The `tinker` command. `tinker new <name>` writes a new Tinker app into `<parent>/<name>`
// (the parent is the current folder unless `--dir` gives one). The result is the exit code:
// 0 when the app was written, 2 for a usage or input error.

import { parseArgs } from "node:util";
import { createApp } from "./new.ts";

/** Where the command writes its messages. */
export interface Output {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

const USAGE = "Usage: tinker new <name> [--dir <parent>]";

/** Runs the command with its arguments (without the program name). Returns the exit code. */
export function run(args: readonly string[], output: Output): number {
  const [command, ...rest] = args;
  if (command !== "new") {
    output.error(command === undefined ? USAGE : `Unknown command "${command}". ${USAGE}`);
    return 2;
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { dir: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    const [name, ...extra] = positionals;
    if (name === undefined || extra.length > 0) {
      output.error(USAGE);
      return 2;
    }
    const folder = createApp(name, values.dir ?? ".");
    output.log(`Created ${folder}. Run \`npm install\` there, then \`npm run dev\`.`);
    return 0;
  } catch (error) {
    output.error((error as Error).message);
    return 2;
  }
}

// The `tinker` command:
//
//   tinker new <name> [--dir <parent>]  writes a new Tinker app into `<parent>/<name>`
//   tinker dev                          serves the app in the current folder
//   tinker build                        builds the app in the current folder into dist/
//
// `new` uses the current folder as its parent unless `--dir` gives one. The result of `run` is
// the exit code: 0 when the command succeeded, 1 when `dev` or `build` failed, and 2 for a usage
// or input error, with the message on stderr. `dev` returns once the server is listening.

import { parseArgs } from "node:util";
import { createApp } from "./new.ts";
import { buildApp, serveApp } from "./vite-commands.ts";

/** Where the command writes its messages. */
export interface Output {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev | tinker build";

/** The app commands: each runs in the current folder, with no arguments. */
const APP_COMMANDS: Readonly<Record<string, (root: string) => Promise<void>>> = {
  dev: serveApp,
  build: buildApp,
};

/** Runs the command with its arguments (without the program name). Returns the exit code. */
export async function run(args: readonly string[], output: Output): Promise<number> {
  const [command, ...rest] = args;
  if (command === "new") {
    return newApp(rest, output);
  }
  const appCommand = command === undefined ? undefined : APP_COMMANDS[command];
  if (appCommand !== undefined) {
    return runAppCommand(appCommand, rest, output);
  }
  output.error(command === undefined ? USAGE : `Unknown command "${command}". ${USAGE}`);
  return 2;
}

async function newApp(args: readonly string[], output: Output): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
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

async function runAppCommand(
  appCommand: (root: string) => Promise<void>,
  args: readonly string[],
  output: Output,
): Promise<number> {
  if (args.length > 0) {
    output.error(USAGE);
    return 2;
  }
  try {
    await appCommand(process.cwd());
    return 0;
  } catch (error) {
    output.error((error as Error).message);
    return 1;
  }
}

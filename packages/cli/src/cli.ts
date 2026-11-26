// The `tinker` command:
//
//   tinker new <name> [--dir <parent>]  writes a new Tinker app into `<parent>/<name>`
//   tinker dev [--port <n> | -p <n>]    serves the app in the current folder
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

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev [--port <n>] | tinker build";

/** The app command `build`: it runs in the current folder, with no arguments. */
const BUILD_COMMAND = "build";

/** Runs the command with its arguments (without the program name). Returns the exit code. */
export async function run(args: readonly string[], output: Output): Promise<number> {
  const [command, ...rest] = args;
  if (command === "new") {
    return newApp(rest, output);
  }
  if (command === "dev") {
    return devApp(rest, output);
  }
  if (command === BUILD_COMMAND) {
    return runAppCommand(buildApp, rest, output);
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

/** `tinker dev [--port <n> | -p <n>]`: the port must be a number from 1 to 65535. */
async function devApp(args: readonly string[], output: Output): Promise<number> {
  let port: number | undefined;
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { port: { type: "string", short: "p" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length > 0) {
      output.error(USAGE);
      return 2;
    }
    port = values.port === undefined ? undefined : parsePort(values.port);
  } catch (error) {
    output.error((error as Error).message);
    return 2;
  }
  try {
    await serveApp(process.cwd(), { port });
    return 0;
  } catch (error) {
    output.error((error as Error).message);
    return 1;
  }
}

/** A port number: digits only, from 1 to 65535. */
function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`--port must be a number from 1 to 65535, got "${value}"`);
  }
  return port;
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

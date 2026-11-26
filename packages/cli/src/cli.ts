// The `tinker` command:
//
//   tinker new <name> [--dir <parent>]           writes a new Tinker app into `<parent>/<name>`
//   tinker dev [--port <n>] [--base <path>]      serves the app in the current folder
//   tinker build [--base <path>]                 builds the app in the current folder into dist/
//
// `new` uses the current folder as its parent unless `--dir` gives one. `--port` and `--base` may
// be written `-p` for the port. `--base` is the folder the app is served under, as a path that
// starts and ends with `/`, such as `/tinker/`; it defaults to `/`. The result of `run` is the
// exit code: 0 when the command succeeded, 1 when `dev` or `build` failed, and 2 for a usage or
// input error, with the message on stderr. `dev` returns once the server is listening.

import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { createApp } from "./new.ts";
import { type AppOptions, buildApp, serveApp } from "./vite-commands.ts";

/** Where the command writes its messages. */
export interface Output {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev [--port <n>] [--base <path>] | tinker build [--base <path>]";

/** The options `dev` and `build` take, besides `--base`, which both take. */
const BASE_OPTION = { base: { type: "string" } } as const;
const PORT_OPTION = { port: { type: "string", short: "p" } } as const;

/** Runs the command with its arguments (without the program name). Returns the exit code. */
export async function run(args: readonly string[], output: Output): Promise<number> {
  const [command, ...rest] = args;
  if (command === "new") {
    return newApp(rest, output);
  }
  if (command === "dev") {
    return appCommand(rest, output, { ...PORT_OPTION, ...BASE_OPTION }, (options) =>
      serveApp(process.cwd(), options));
  }
  if (command === "build") {
    return appCommand(rest, output, BASE_OPTION, (options) => buildApp(process.cwd(), options));
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

/**
 * Runs `dev` or `build`: its options are parsed and checked first (a bad one exits with 2), then
 * the command runs (a failure exits with 1). Nothing else may follow the options.
 */
async function appCommand(
  args: readonly string[],
  output: Output,
  options: ParseArgsOptionsConfig,
  command: (options: AppOptions) => Promise<void>,
): Promise<number> {
  let parsed: AppOptions;
  try {
    const { values, positionals } = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length > 0) {
      output.error(USAGE);
      return 2;
    }
    const { port, base } = values;
    parsed = {
      port: typeof port === "string" ? parsePort(port) : undefined,
      base: typeof base === "string" ? parseBase(base) : undefined,
    };
  } catch (error) {
    output.error((error as Error).message);
    return 2;
  }
  try {
    await command(parsed);
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

/** A base path: it starts and ends with `/`. */
function parseBase(value: string): string {
  if (!value.startsWith("/") || !value.endsWith("/")) {
    throw new Error(`--base must start and end with "/", such as "/tinker/", got "${value}"`);
  }
  return value;
}

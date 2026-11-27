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

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { createApp, DEFAULT_PREFIX } from "./new.ts";
import { DEFAULT_TEST_RUNNER, type TestRunner } from "./templates.ts";
import { apply, plan } from "./generate.ts";
import { type AppOptions, buildApp, previewApp, serveApp } from "./vite-commands.ts";

/** Where the command writes its messages. */
export interface Output {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

const USAGE = "Usage: tinker new <name> [--dir <parent>] [--prefix <prefix>] [--test-runner <vitest|node>] [--install] | tinker dev [--port <n>] [--base <path>] | tinker build [--base <path>] | tinker preview [--port <n>] [--base <path>] | tinker generate <kind> <name>";

/** What `tinker --help` prints: each command, and what it does. */
const HELP = `${USAGE.replace("Usage: ", "Usage:\n  ")
  .replaceAll(" | ", "\n  ")}

Commands:
  new <name>      write a new Tinker app into <parent>/<name> (the current folder, or --dir)
  dev             serve the app in the current folder, until it is stopped
  build           build the app in the current folder into dist/
  preview         serve the built dist/ folder, until it is stopped (run build first)
  generate <kind> <name>  write a component, directive, service or function into src/<name>/, and
                          register it in src/app.ts (--dry-run plans it without writing)

Options:
  -p, --port <n>  the port, a number from 1 to 65535 (dev and preview)
  --base <path>   the folder the app is served under, such as /tinker/ (dev, build, preview)
  --dir <parent>  the folder to write the new app into (new)
  --prefix <p>    the prefix of the app's component selectors, default app (new)
  --test-runner <r>  the test runner: vitest (the default) or node (new)
  --install       run npm install in the new app (new)
  -h, --help      print this help
  -v, --version   print the version`;

/**
 * The version of this package. The code is bundled into `dist/assets/` in a build, so the package
 * is found by walking up from this file to the folder whose package.json is this package's.
 */
function versionOf(): string {
  return findVersion(dirname(fileURLToPath(import.meta.url)));
}

/** The version in the package.json of `@tinker/cli`, found from `folder` upward. */
export function findVersion(folder: string): string {
  for (let current = folder; ; current = dirname(current)) {
    const file = join(current, "package.json");
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version: string };
      if (manifest.name === "@tinker/cli") {
        return manifest.version;
      }
    }
    if (dirname(current) === current) {
      throw new Error("The version of @tinker/cli could not be found");
    }
  }
}

/** The options `dev` and `build` take, besides `--base`, which both take. */
const BASE_OPTION = { base: { type: "string" } } as const;
const PORT_OPTION = { port: { type: "string", short: "p" } } as const;

/** Runs the command with its arguments (without the program name). Returns the exit code. */
export async function run(args: readonly string[], output: Output): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    output.log(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    output.log(versionOf());
    return 0;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    output.log(HELP);
    return 0;
  }
  if (command === "new") {
    return newApp(rest, output);
  }
  if (command === "dev") {
    return appCommand(rest, output, { ...PORT_OPTION, ...BASE_OPTION }, (options) =>
      serveApp(process.cwd(), options));
  }
  if (command === "generate") {
    return generateCommand(rest, output);
  }
  if (command === "preview") {
    return appCommand(rest, output, { ...PORT_OPTION, ...BASE_OPTION }, (options) =>
      previewApp(process.cwd(), options));
  }
  if (command === "build") {
    return appCommand(rest, output, BASE_OPTION, (options) => buildApp(process.cwd(), options));
  }
  output.error(`Unknown command "${command}". ${USAGE}`);
  return 2;
}

async function newApp(args: readonly string[], output: Output): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: {
        "dir": { type: "string" },
        "prefix": { type: "string" },
        "test-runner": { type: "string" },
        "install": { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });
    const [name, ...extra] = positionals;
    if (name === undefined || extra.length > 0) {
      output.error(USAGE);
      return 2;
    }
    const folder = createApp(
      name,
      values.dir ?? ".",
      values.prefix ?? DEFAULT_PREFIX,
      (values["test-runner"] ?? DEFAULT_TEST_RUNNER) as TestRunner,
    );
    if (values.install) {
      output.log(`Created ${folder}. Installing its packages...`);
      const install = spawnSync("npm", ["install"], { cwd: folder, stdio: "inherit" });
      if (install.status !== 0) {
        output.error(`npm install failed in ${folder}: run it there, then npm run dev`);
        return 1;
      }
      output.log(`Installed. Run \`npm run dev\` in ${folder}.`);
      return 0;
    }
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
/** `tinker generate <kind> <name> [--dry-run]`: writes the item and registers it, or plans it. */
function generateCommand(args: readonly string[], output: Output): number {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { "dry-run": { type: "boolean" } },
      allowPositionals: true,
      strict: true,
    });
    const [kind, name, ...extra] = positionals;
    if (kind === undefined || name === undefined || extra.length > 0) {
      output.error(USAGE);
      return 2;
    }
    const planned = plan(process.cwd(), kind, name);
    const created = planned.files.map((file) => `  ${file.path}`);
    if (values["dry-run"]) {
      output.log(`Dry run: nothing is written. It would create:\n${created.join("\n")}`);
      if (planned.app !== undefined) {
        output.log(`and change ${planned.app.path} to:\n${planned.app.content}`);
      }
      return 0;
    }
    apply(process.cwd(), planned);
    output.log(`Created:\n${created.join("\n")}`);
    if (planned.app !== undefined) {
      output.log(`Registered it in ${planned.app.path}.`);
    }
    return 0;
  } catch (error) {
    output.error((error as Error).message);
    return 2;
  }
}

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

// The compile step as a command, for a library: each file given is written, with its
// compiled templates replaced by their trees, into the output directory at the same
// path relative to the working directory. A file that does not compile is reported,
// and nothing is written for it. The result is the exit code.
//
// The output is still TypeScript: the library's own build compiles it to JavaScript,
// including the decorators. The helper imports it adds need @tinker/functional and
// @tinker/core, which the library depends on.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { type CheckOutput } from "./check.ts";
import { type CheckHost, emitFile } from "./plugin.ts";
import { resolveRelative } from "./resolve.ts";

/** What the command was asked to do. */
export interface EmitOptions {
  readonly outDir: string;
  readonly files: readonly string[];
  readonly strict: boolean;
  /** The library's manifest, which must declare the packages the compiled files import. */
  readonly packagePath: string;
}

/** The packages every compiled file imports, which a library must declare. */
const REQUIRED_PACKAGES = ["@tinker/functional", "@tinker/core"];

/**
 * The options from the command line: `--out <dir> [--package <package.json>] [--strict]
 * <file.ts>...`. Throws when the output directory or a file is missing.
 */
export function parseArguments(args: readonly string[]): EmitOptions {
  const values = new Map<string, string>();
  const files: string[] = [];
  let strict = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--strict") {
      strict = true;
    } else if (arg === "--out" || arg === "--package") {
      const value = args[++index];
      if (value !== undefined) {
        values.set(arg, value);
      }
    } else {
      files.push(arg);
    }
  }
  const outDir = values.get("--out");
  if (outDir === undefined || files.length === 0) {
    throw new Error("Usage: tinker-compile --out <dir> [--package <package.json>] [--strict] <file.ts>...");
  }
  return { outDir, files, strict, packagePath: values.get("--package") ?? "package.json" };
}

/** The required packages that the manifest at `packagePath` does not declare. */
function missingPackages(packagePath: string): string[] {
  const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
  };
  const declared = { ...manifest.peerDependencies, ...manifest.dependencies };
  return REQUIRED_PACKAGES.filter((name) => !(name in declared));
}

/**
 * The path of `file` under the output directory: its path relative to the working
 * directory. A file outside the working directory has no such path, and is an error.
 */
function placeInOutput(file: string): string {
  const relativePath = relative(process.cwd(), file);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`${file} is outside the working directory: it cannot be written under the output`);
  }
  return relativePath;
}

/** Emits each file. Returns 0 when every file was written, 1 when one did not compile. */
export async function emitFiles(options: EmitOptions, output: CheckOutput): Promise<number> {
  let missing: string[];
  try {
    missing = missingPackages(options.packagePath);
  } catch (error) {
    output.error((error as Error).message);
    return 1;
  }
  if (missing.length > 0) {
    output.error(`${options.packagePath} does not declare ${missing.join(", ")}: the compiled files import them`);
    output.log("The compile failed: nothing was written.");
    return 1;
  }
  let failed = false;
  for (const file of options.files) {
    const path = resolve(file);
    const host: CheckHost = {
      resolve: async (source, importer) => resolveRelative(source, importer),
      error: (message) => {
        throw new Error(message);
      },
      warn: (message) => output.error(`warning: ${message}`),
    };
    try {
      const code = readFileSync(path, "utf8");
      const emitted = await emitFile(code, path, host, { emit: true, strict: options.strict });
      const target = join(options.outDir, placeInOutput(path));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, emitted?.code ?? code);
    } catch (error) {
      failed = true;
      output.error((error as Error).message);
    }
  }
  output.log(failed
    ? "The compile failed: the files that compiled are written."
    : `Compiled ${options.files.length} file(s) into ${options.outDir}.`);
  return failed ? 1 : 0;
}

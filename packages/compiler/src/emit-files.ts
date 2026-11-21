// The compile step as a command, for a library: each file given is written, with its
// compiled templates replaced by their trees, into the output directory at the same
// path relative to the working directory. A file that does not compile is reported,
// and nothing is written for it. The result is the exit code.
//
// The output is still TypeScript: the library's own build compiles it to JavaScript,
// including the decorators. The helper imports it adds need @tinker/functional and
// @tinker/core, which the library depends on.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type CheckOutput } from "./check.ts";
import { type CheckHost, emitFile } from "./plugin.ts";
import { resolveRelative } from "./resolve.ts";

/** What the command was asked to do. */
export interface EmitOptions {
  readonly outDir: string;
  readonly files: readonly string[];
  readonly strict: boolean;
}

/**
 * The options from the command line: `--out <dir> [--strict] <file.ts>...`.
 * Throws when the output directory or a file is missing.
 */
export function parseArguments(args: readonly string[]): EmitOptions {
  const strict = args.includes("--strict");
  const outIndex = args.indexOf("--out");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const files = args.filter((arg, index) => arg !== "--strict" && index !== outIndex && index !== outIndex + 1);
  if (outDir === undefined || files.length === 0) {
    throw new Error("Usage: tinker-compile --out <dir> [--strict] <file.ts>...");
  }
  return { outDir, files, strict };
}

/** Emits each file. Returns 0 when every file was written, 1 when one did not compile. */
export async function emitFiles(options: EmitOptions, output: CheckOutput): Promise<number> {
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
      const target = join(options.outDir, relative(process.cwd(), path));
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

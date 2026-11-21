// The check as a command, for a library's files that are not built by Vite: each file
// is checked the way the plugin checks it, with its imports found on disk.
// It changes nothing. Errors and warnings go to `output`; the result is the exit code.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type CheckHost, compileComponents, type CompileMode } from "./plugin.ts";
import { resolveImport } from "./resolve.ts";

/** Where the check writes its messages. */
export interface CheckOutput {
  log(line: string): void;
  error(line: string): void;
}

/**
 * Checks each of `files`. Returns 0 when every template compiles and nothing was
 * skipped with a warning (in strict mode, nothing that cannot be checked); 1 otherwise.
 */
export async function checkFiles(
  files: readonly string[],
  options: { readonly strict: boolean },
  output: CheckOutput,
): Promise<number> {
  const mode: CompileMode = { emit: false, strict: options.strict };
  let failed = false;
  for (const file of files) {
    const path = resolve(file);
    const host: CheckHost = {
      resolve: async (source, importer) => resolveImport(source, importer),
      error: (message) => {
        throw new Error(message);
      },
      warn: (message) => output.error(`warning: ${message}`),
    };
    try {
      await compileComponents(readFileSync(path, "utf8"), path, host, mode);
    } catch (error) {
      failed = true;
      output.error((error as Error).message);
    }
  }
  output.log(failed ? "The check failed." : `Checked ${files.length} file(s).`);
  return failed ? 1 : 0;
}

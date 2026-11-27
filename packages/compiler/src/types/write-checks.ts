// The type check files: for each source file with components, the file of checks for its
// templates, next to it as `<name>.template-check.ts`. `npm run typecheck` runs after this
// command, so the checks are type checked with the rest of the code.

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { checkedTemplatesOf, type CheckHost } from "../plugin.ts";
import { resolveImport } from "../resolve.ts";
import { checkFileOf } from "./template-check.ts";

/** Where the command writes its messages. */
export interface TypesOutput {
  log(line: string): void;
  error(line: string): void;
}

/** The check file of a source file: next to it. */
export function checkFileNameOf(file: string): string {
  return join(dirname(file), `${basename(file, ".ts")}.template-check.ts`);
}

/**
 * The TypeScript files under `paths` (files, or folders searched recursively), without the
 * declaration files, the tests, the dependencies, the builds and the check files themselves.
 */
export function sourceFilesUnder(paths: readonly string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    const absolute = resolve(path);
    if (statSync(absolute)
      .isDirectory()) {
      for (const entry of readdirSync(absolute, { recursive: true })
        .map(String)) {
        const file = join(absolute, entry);
        if (isSource(file)) {
          files.push(file);
        }
      }
    } else if (isSource(absolute)) {
      files.push(absolute);
    }
  }
  return files;
}

function isSource(file: string): boolean {
  return file.endsWith(".ts")
    && !file.endsWith(".d.ts")
    && !file.endsWith(".test.ts")
    && !file.endsWith(".template-check.ts")
    && !file.split("/")
      .some((part) => part === "node_modules" || part === "dist");
}

/**
 * The host the check reads with: imports are resolved as the build does, and warnings go to
 * `output`. A check reports no error of its own, so a failure is thrown and ends that file.
 *
 * @param output Where the warnings go.
 * @returns The host for `checkedTemplatesOf`.
 */
export function checkHostFor(output: TypesOutput): CheckHost {
  return {
    resolve: async (source, importer) => resolveImport(source, importer),
    error: (message) => {
      throw new Error(message);
    },
    warn: (message) => output.error(`warning: ${message}`),
  };
}

/**
 * Writes the check files of `files`. A component whose class is not exported cannot be imported,
 * so it is not checked (a warning). A file with no checkable component gets no check file, and a
 * check file left from an earlier run is removed.
 *
 * @returns 0 on success; 1 when a file could not be read.
 */
export async function writeChecks(files: readonly string[], output: TypesOutput): Promise<number> {
  let failed = false;
  let written = 0;
  for (const file of files) {
    const path = resolve(file);
    const host = checkHostFor(output);
    try {
      const code = readFileSync(path, "utf8");
      const templates = await checkedTemplatesOf(code, path, host);
      const checkable = templates.filter((template) => {
        const exported = new RegExp(`export\\s+(abstract\\s+)?class\\s+${template.name}\\b`)
          .test(code);
        if (!exported) {
          output.error(`warning: ${template.name} is not exported, so its template is not type checked`);
        }
        return exported;
      });
      const checkFile = checkFileNameOf(path);
      if (checkable.length === 0) {
        if (existsSync(checkFile)) {
          rmSync(checkFile);
        }
        continue;
      }
      writeFileSync(checkFile, checkFileOf(checkable, checkFile));
      written++;
    } catch (error) {
      failed = true;
      output.error(`${relative(process.cwd(), path)}: ${(error as Error).message}`);
    }
  }
  output.log(failed ? "The type check files could not all be written." : `Wrote ${written} type check file(s).`);
  return failed ? 1 : 0;
}

// Finds the file a relative import names, for the commands that read a library's files
// from disk. Imports that are not relative are not followed.

import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** A relative import as the file it names: as written, with `.ts`, or `/index.ts`.
 * Null for anything else. */
export function resolveRelative(source: string, importer: string): Promise<string | null> {
  if (!source.startsWith(".")) {
    return Promise.resolve(null);
  }
  const base = resolve(dirname(importer), source);
  const file = [base, `${base}.ts`, `${base}/index.ts`].find(isFile);
  return Promise.resolve(file ?? null);
}

function isFile(path: string): boolean {
  try {
    return statSync(path)
      .isFile();
  } catch {
    return false;
  }
}

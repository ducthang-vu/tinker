// Writes a new Tinker app: the files of `appFiles(name)` in `<parent>/<name>`. The folder must not
// exist yet, or be empty, so nothing is overwritten.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appFiles } from "./templates.ts";

/** A name is a package name: lower case letters, digits and dashes, starting with a letter. */
export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Writes the app into `<parent>/<name>` and returns that folder. Throws when the name is not a
 * valid package name, or the folder exists and is not empty.
 */
export function createApp(name: string, parent: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`"${name}" is not a valid app name: use lower case letters, digits and dashes`);
  }
  const folder = join(parent, name);
  if (existsSync(folder) && readdirSync(folder).length > 0) {
    throw new Error(`${folder} already exists and is not empty`);
  }
  for (const [path, content] of appFiles(name)) {
    const file = join(folder, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return folder;
}

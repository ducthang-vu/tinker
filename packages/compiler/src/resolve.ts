// Finds the file an import names, for the commands that read a library's files from
// disk. Three kinds of import are followed, and each is read as TypeScript source:
//
// - a relative import (`./card.ts`, `../lib`);
// - a path alias of the nearest tsconfig.json (its `paths`, with `*` as in TypeScript);
// - a package in node_modules, through its `development` export when that is a `.ts`
//   file. A package that ships only built JavaScript is not followed: its decorators
//   are compiled away, so its selectors cannot be read.
//
// Anything else is not found, and the component that needs it is skipped.

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The file an import names, or null when it is not one of the kinds above. */
export function resolveImport(source: string, importer: string): Promise<string | null> {
  return Promise.resolve(resolveSync(source, importer) ?? null);
}

function resolveSync(source: string, importer: string): string | undefined {
  if (source.startsWith(".")) {
    return firstFile(resolve(dirname(importer), source));
  }
  return resolveAlias(source, importer) ?? resolvePackage(source, importer);
}

/** The first file of a path: as written, with `.ts`, or as an `index.ts` of a folder. */
function firstFile(base: string): string | undefined {
  return [base, `${base}.ts`, `${base}/index.ts`].find(isFile);
}

/** A path alias of the nearest tsconfig.json that names `source`. */
function resolveAlias(source: string, importer: string): string | undefined {
  const config = nearestTsconfig(dirname(importer));
  if (config === undefined) {
    return undefined;
  }
  const entries = Object.entries(config.paths);
  // An exact alias wins over a pattern, as in TypeScript.
  const exact = entries.find(([pattern]) => pattern === source);
  if (exact !== undefined) {
    return targetOf(exact[1], "", config.dir);
  }
  for (const [pattern, targets] of entries) {
    const star = pattern.indexOf("*");
    if (star === -1 || !source.startsWith(pattern.slice(0, star))) {
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (source.endsWith(suffix)) {
      const captured = source.slice(prefix.length, source.length - suffix.length);
      const found = targetOf(targets, captured, config.dir);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/** The first target of an alias that is a file, with `*` replaced by `captured`. */
function targetOf(targets: readonly string[], captured: string, dir: string): string | undefined {
  for (const target of targets) {
    const found = firstFile(resolve(dir, target.replace("*", captured)));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

interface PathsConfig {
  /** The folder of the tsconfig.json: its path aliases are relative to it. */
  readonly dir: string;
  readonly paths: Readonly<Record<string, readonly string[]>>;
}

/** The paths of the nearest tsconfig.json at or above `dir`, when it has any. */
function nearestTsconfig(dir: string): PathsConfig | undefined {
  let current = dir;
  for (;;) {
    const file = join(current, "tsconfig.json");
    if (isFile(file)) {
      const options = (JSON.parse(readFileSync(file, "utf8")) as {
        compilerOptions?: { paths?: Record<string, string[]> };
      }).compilerOptions;
      return { dir: current, paths: options?.paths ?? {} };
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/** The source of a package, from the `development` export of its package.json in node_modules. */
function resolvePackage(source: string, importer: string): string | undefined {
  const [scope = "", name = "", ...rest] = source.split("/");
  const scoped = scope.startsWith("@");
  const packageName = scoped ? `${scope}/${name}` : scope;
  const subpath = scoped ? rest : [name, ...rest].filter((part) => part !== "");
  const key = subpath.length === 0 ? "." : `./${subpath.join("/")}`;
  const packageDir = findPackage(dirname(importer), packageName);
  if (packageDir === undefined) {
    return undefined;
  }
  const exports = (JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    exports?: Record<string, { development?: string } | string>;
  }).exports;
  const entry = exports?.[key];
  const development = typeof entry === "string" ? undefined : entry?.development;
  return development?.endsWith(".ts") && isFile(join(packageDir, development))
    ? join(packageDir, development)
    : undefined;
}

/** The folder of a package in the node_modules of `dir` or of a folder above it. */
function findPackage(dir: string, name: string): string | undefined {
  let current = dir;
  for (;;) {
    const candidate = join(current, "node_modules", name);
    if (isFile(join(candidate, "package.json"))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path)
      .isFile();
  } catch {
    return false;
  }
}

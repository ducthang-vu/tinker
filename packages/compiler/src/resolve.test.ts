import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resolveImport } from "./resolve.ts";

const fixtures = resolve("packages/compiler/test/fixtures");
const at = (name: string) => join(fixtures, name);

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A folder with the given files, for the tests that need a package in node_modules. */
function folder(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "tinker-resolve-"));
  directories.push(directory);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(directory, path, ".."), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
  return directory;
}

describe("resolveImport", () => {
  test("a relative import is the file it names, with .ts added when it is left out", async () => {
    expect(await resolveImport("./item.ts", at("importer.ts")))
      .toBe(at("item.ts"));
    expect(await resolveImport("./item", at("importer.ts")))
      .toBe(at("item.ts"));
    expect(await resolveImport("./nope.ts", at("importer.ts")))
      .toBeNull();
  });

  test("a path alias with * names the file its pattern gives", async () => {
    expect(await resolveImport("@app/card", at("aliased/page.ts")))
      .toBe(at("aliased/lib/card.ts"));
  });

  test("a pattern whose end does not match is not used", async () => {
    expect(await resolveImport("@app/card", at("aliased/page.ts")))
      .toBe(at("aliased/lib/card.ts"));
  });

  test("an exact path alias names its file", async () => {
    expect(await resolveImport("@app/plain", at("aliased/page.ts")))
      .toBe(at("aliased/lib/plain.ts"));
  });

  test("a path alias that names no file is not found", async () => {
    expect(await resolveImport("@app/missing/nothing", at("aliased/page.ts")))
      .toBeNull();
  });

  test("a package is read through its development export, when that is a .ts file", async () => {
    const directory = folder({
      "node_modules/lib-x/package.json": JSON.stringify({
        exports: { ".": { development: "./src/index.ts", default: "./dist/index.js" }, "./x": { development: "./src/x.ts" } },
      }),
      "node_modules/lib-x/src/index.ts": "export const a = 1;",
      "node_modules/lib-x/src/x.ts": "export const b = 2;",
      "app/page.ts": "",
    });
    expect(await resolveImport("lib-x", join(directory, "app/page.ts")))
      .toBe(join(directory, "node_modules/lib-x/src/index.ts"));
    expect(await resolveImport("lib-x/x", join(directory, "app/page.ts")))
      .toBe(join(directory, "node_modules/lib-x/src/x.ts"));
  });

  test("a package that exports only built JavaScript is not followed", async () => {
    const directory = folder({
      "node_modules/built/package.json": JSON.stringify({ exports: { ".": { default: "./dist/index.js" } } }),
      "node_modules/built/dist/index.js": "export const a = 1;",
      "app/page.ts": "",
    });
    expect(await resolveImport("built", join(directory, "app/page.ts")))
      .toBeNull();
  });

  test("a subpath the package does not export, and an export that is a plain path, are not followed", async () => {
    const directory = folder({
      "node_modules/lib-y/package.json": JSON.stringify({ exports: "./src/index.ts" }),
      "node_modules/lib-y/src/index.ts": "export const a = 1;",
      "app/page.ts": "",
    });
    expect(await resolveImport("lib-y", join(directory, "app/page.ts")))
      .toBeNull();
    expect(await resolveImport("lib-y/missing", join(directory, "app/page.ts")))
      .toBeNull();
  });

  test("a tsconfig with no path aliases names nothing", async () => {
    const withoutOptions = folder({ "app/tsconfig.json": "{}", "app/page.ts": "" });
    const withoutPaths = folder({ "app/tsconfig.json": JSON.stringify({ compilerOptions: {} }), "app/page.ts": "" });
    expect(await resolveImport("@any/thing", join(withoutOptions, "app/page.ts")))
      .toBeNull();
    expect(await resolveImport("@any/thing", join(withoutPaths, "app/page.ts")))
      .toBeNull();
  });

  test("a development export that is not a .ts file that exists is not followed", async () => {
    const directory = folder({
      "node_modules/lib-v/package.json": JSON.stringify({ exports: { ".": { development: "./src/index.js" } } }),
      "node_modules/lib-v/src/index.js": "export const a = 1;",
      "node_modules/lib-u/package.json": JSON.stringify({ exports: { ".": "./src/index.ts" } }),
      "node_modules/lib-u/src/index.ts": "export const a = 1;",
      "node_modules/lib-w/package.json": JSON.stringify({ exports: { ".": { development: "./src/missing.ts" } } }),
      "app/page.ts": "",
    });
    expect(await resolveImport("lib-v", join(directory, "app/page.ts")))
      .toBeNull();
    expect(await resolveImport("lib-w", join(directory, "app/page.ts")))
      .toBeNull();
    expect(await resolveImport("lib-u", join(directory, "app/page.ts")))
      .toBeNull();
  });

  test("a package with no exports at all is not followed", async () => {
    const directory = folder({
      "node_modules/lib-z/package.json": JSON.stringify({ main: "./index.js" }),
      "app/page.ts": "",
    });
    expect(await resolveImport("lib-z", join(directory, "app/page.ts")))
      .toBeNull();
  });

  test("a package that is not installed is not found", async () => {
    expect(await resolveImport("not-installed-anywhere", at("importer.ts")))
      .toBeNull();
  });
});

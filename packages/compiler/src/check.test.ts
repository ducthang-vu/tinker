import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkFiles, type CheckOutput } from "./check.ts";

const fixture = (name: string) => resolve("packages/compiler/test/fixtures", name);

// Files written by a test, in a directory removed afterwards.
const directories: string[] = [];
function writeSource(code: string): string {
  const directory = mkdtempSync(join(tmpdir(), "tinker-check-"));
  directories.push(directory);
  const path = join(directory, "page.ts");
  writeFileSync(path, code);
  return path;
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** An output that keeps what it is given. */
function recording(): CheckOutput & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
}

describe("checkFiles", () => {
  test("returns 0 for files whose templates compile, and imports are found on disk", async () => {
    const output = recording();
    const code = await checkFiles([fixture("importer.ts")], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual([]);
    expect(output.logs)
      .toEqual(["Checked 1 file(s)."]);
  });

  test("returns 1, and names the component, for a template that does not compile", async () => {
    const output = recording();
    const code = await checkFiles([fixture("broken.ts")], output);
    expect(code)
      .toBe(1);
    expect(output.errors)
      .toEqual([
        "broken.ts: <Broken>: Missing a name at the end (at column 6 in \" a + \"), at line 1, column 4 of the template",
      ]);
    expect(output.logs)
      .toEqual(["The check failed."]);
  });

  test("warns about a template that is not a literal, and still returns 0", async () => {
    const output = recording();
    const code = await checkFiles([fixture("dynamic.ts")], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual(["warning: dynamic.ts: <Dynamic> is not compiled: its template is not a literal"]);
  });

  test("a file that cannot be read is reported, and the others are still checked", async () => {
    const output = recording();
    const code = await checkFiles([fixture("missing.ts"), fixture("importer.ts")], output);
    expect(code)
      .toBe(1);
    expect(output.errors[0])
      .toContain("ENOENT");
    expect(output.logs)
      .toEqual(["The check failed."]);
  });

  test("an import that is not a relative path or a file is not found", async () => {
    const output = recording();
    const code = await checkFiles([fixture("external.ts")], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual(["warning: external.ts: <External> is not compiled: Widget has no literal selector, or is not found"]);
  });

  test("an import from a package, not a relative path, is not looked up on disk", async () => {
    const path = writeSource(`
      import { Widget } from "some-package";
      import { Component } from "@tinker/core";
      @Component({ selector: "tk-page", template: "<p>x</p>", imports: [Widget] }) export class Page {}
    `);
    const output = recording();
    const code = await checkFiles([path], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual([
        "warning: page.ts: <Page> is not compiled: Widget has no literal selector, or is not found",
      ]);
  });

  test("a relative import of a file that does not exist is not found", async () => {
    const path = writeSource(`
      import { Gone } from "./gone.ts";
      import { Component } from "@tinker/core";
      @Component({ selector: "tk-page", template: "<p>x</p>", imports: [Gone] }) export class Page {}
    `);
    const output = recording();
    const code = await checkFiles([path], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual([
        "warning: page.ts: <Page> is not compiled: Gone has no literal selector, or is not found",
      ]);
  });

  test("an import through a path alias is followed, and its directive is checked", async () => {
    const output = recording();
    const code = await checkFiles([fixture("aliased/page.ts")], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual([]);
  });

  test("an alias that names no file is reported as a warning", async () => {
    const output = recording();
    const code = await checkFiles([fixture("aliased/unknown.ts")], output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual(["warning: unknown.ts: <Unknown> is not compiled: Nothing has no literal selector, or is not found"]);
  });
});

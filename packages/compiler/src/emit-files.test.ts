import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CheckOutput } from "./check.ts";
import { emitFiles, parseArguments } from "./emit-files.ts";
import { type Maybe } from "@tinker/functional";

const fixture = (name: string) => resolve("packages/compiler/test/fixtures", name);

/** A manifest that declares the packages the compiled files import. */
const MANIFEST = fixture("library-package.json");

const directories: string[] = [];
function outputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "tinker-compile-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Where a file is written: its path relative to the working directory, under the output. */
const writtenAt = (outDir: string, file: string) =>
  join(outDir, relative(process.cwd(), fixture(file)));

function recording(): CheckOutput & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return { logs, errors, log: (line) => logs.push(line), error: (line) => errors.push(line) };
}

describe("parseArguments", () => {
  test("reads the output directory and the files", () => {
    expect(parseArguments(["--out", "dist", "a.ts", "b.ts"]))
      .toEqual({ outDir: "dist", files: ["a.ts", "b.ts"], emit: false, packagePath: "package.json" });
  });

  test("an option with no value is not given, so the usage error is raised", () => {
    expect(() => parseArguments(["a.ts", "--out"]))
      .toThrow("Usage: tinker-compile");
  });

  test("--emit asks for the emitted trees", () => {
    expect(parseArguments(["--out", "dist", "--emit", "a.ts"]))
      .toEqual({ outDir: "dist", files: ["a.ts"], emit: true, packagePath: "package.json" });
  });

  test("needs an output directory", () => {
    expect(() => parseArguments(["a.ts"]))
      .toThrow("Usage: tinker-compile");
  });

  test("needs at least one file", () => {
    expect(() => parseArguments(["--out", "dist"]))
      .toThrow("Usage: tinker-compile");
  });
});

describe("emitFiles", () => {
  test("writes a file whose templates compile, with the trees in place of the templates", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("item.ts")], emit: true, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(0);
    const written = readFileSync(writtenAt(outDir, "item.ts"), "utf8");
    expect(written)
      .toContain("__tinkerNone.of()");
    expect(written)
      .toContain(`import { Some as __tinkerSome, None as __tinkerNone } from "@tinker/functional";`);
    expect(output.logs)
      .toEqual([`Compiled 1 file(s) into ${outDir}.`]);
  });

  test("copies a file with nothing to emit as it is", async () => {
    const outDir = outputDirectory();
    const code = await emitFiles({ outDir, files: [fixture("no-selector.ts")], emit: true, packagePath: MANIFEST }, recording());
    expect(code)
      .toBe(0);
    expect(readFileSync(writtenAt(outDir, "no-selector.ts"), "utf8"))
      .toBe(readFileSync(fixture("no-selector.ts"), "utf8"));
  });

  test("a file that does not compile is reported, nothing is written for it, and the result is 1", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("broken.ts"), fixture("item.ts")], emit: true, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(1);
    expect(existsSync(writtenAt(outDir, "broken.ts")))
      .toBe(false);
    expect(existsSync(writtenAt(outDir, "item.ts")))
      .toBe(true);
    expect(output.errors)
      .toEqual([
        "broken.ts: <Broken>: Missing a name at the end (at column 6 in \" a + \"), at line 1, column 4 of the template",
      ]);
    expect(output.logs)
      .toEqual(["The compile failed: the files that compiled are written."]);
  });

  test("a file that cannot be read is reported, and the result is 1", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("missing.ts")], emit: true, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(1);
    expect(output.errors[0])
      .toContain("ENOENT");
  });

  test("finds the relative imports of a file on disk, to emit its templates", async () => {
    const outDir = outputDirectory();
    const code = await emitFiles({ outDir, files: [fixture("importer.ts")], emit: true, packagePath: MANIFEST }, recording());
    expect(code)
      .toBe(0);
    expect(readFileSync(writtenAt(outDir, "importer.ts"), "utf8"))
      .toContain("__tinkerSelector");
  });

  test("a component that cannot be checked is warned about, and the file is still written", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("dynamic.ts")], emit: true, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(0);
    expect(output.errors)
      .toEqual(["warning: dynamic.ts: <Dynamic> is not compiled: its template is not a literal"]);
    expect(existsSync(writtenAt(outDir, "dynamic.ts")))
      .toBe(true);
  });

  test("a file outside the working directory is an error, and nothing is written for it", async () => {
    const outDir = outputDirectory();
    const outside = mkdtempSync(join(tmpdir(), "tinker-outside-"));
    directories.push(outside);
    const path = join(outside, "page.ts");
    writeFileSync(path, "export const x = 1;");
    const output = recording();
    const options = { outDir, files: [path], emit: true, packagePath: MANIFEST };
    const code = await emitFiles(options, output);
    expect(code)
      .toBe(1);
    expect(output.errors)
      .toEqual([`${path} is outside the working directory: it cannot be written under the output`]);
  });

  test("a manifest that does not declare a package the compiled files import is an error, and nothing is written", async () => {
    const outDir = outputDirectory();
    const manifestDirectory = mkdtempSync(join(tmpdir(), "tinker-manifest-"));
    directories.push(manifestDirectory);
    const manifest = join(manifestDirectory, "package.json");
    writeFileSync(manifest, JSON.stringify({ dependencies: { "@tinker/core": "*" } }));
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("item.ts")], emit: true, packagePath: manifest }, output);
    expect(code)
      .toBe(1);
    expect(output.errors)
      .toEqual([`${manifest} does not declare @tinker/functional: the compiled files import them`]);
    expect(output.logs)
      .toEqual(["The compile failed: nothing was written."]);
    expect(existsSync(writtenAt(outDir, "item.ts")))
      .toBe(false);
  });

  test("a manifest that peer dependencies declare counts as declared", async () => {
    const outDir = outputDirectory();
    const manifestDirectory = mkdtempSync(join(tmpdir(), "tinker-manifest-"));
    directories.push(manifestDirectory);
    const manifest = join(manifestDirectory, "package.json");
    writeFileSync(manifest, JSON.stringify({ peerDependencies: { "@tinker/core": "*", "@tinker/functional": "*" } }));
    const code = await emitFiles({ outDir, files: [fixture("item.ts")], emit: true, packagePath: manifest }, recording());
    expect(code)
      .toBe(0);
  });

  test("a manifest that cannot be read is an error, and nothing is written", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const options = { outDir, files: [fixture("item.ts")], emit: true, packagePath: join(outDir, "nope.json") };
    const code = await emitFiles(options, output);
    expect(code)
      .toBe(1);
    expect(output.errors[0])
      .toContain("ENOENT");
    expect(existsSync(writtenAt(outDir, "item.ts")))
      .toBe(false);
  });

  test("without --emit, a file keeps its template strings, and is checked", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("item.ts")], emit: false, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(0);
    const written = readFileSync(writtenAt(outDir, "item.ts"), "utf8");
    expect(written)
      .toBe(readFileSync(fixture("item.ts"), "utf8"));
    expect(written)
      .not.toContain("__tinkerNone");
  });

  test("without --emit, a template that does not compile still fails the file", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("broken.ts")], emit: false, packagePath: MANIFEST }, output);
    expect(code)
      .toBe(1);
    expect(existsSync(writtenAt(outDir, "broken.ts")))
      .toBe(false);
  });
});

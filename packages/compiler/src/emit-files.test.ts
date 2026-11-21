import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CheckOutput } from "./check.ts";
import { emitFiles, parseArguments } from "./emit-files.ts";

const fixture = (name: string) => resolve("packages/compiler/test/fixtures", name);

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
  test("reads the output directory, the strict flag and the files", () => {
    expect(parseArguments(["--out", "dist", "--strict", "a.ts", "b.ts"]))
      .toEqual({ outDir: "dist", files: ["a.ts", "b.ts"], strict: true });
  });

  test("without the strict flag, it is not strict", () => {
    expect(parseArguments(["a.ts", "--out", "dist"]))
      .toEqual({ outDir: "dist", files: ["a.ts"], strict: false });
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
    const code = await emitFiles({ outDir, files: [fixture("item.ts")], strict: false }, output);
    expect(code)
      .toBe(0);
    const written = readFileSync(writtenAt(outDir, "item.ts"), "utf8");
    expect(written)
      .toContain("__tinkerMaybe.none()");
    expect(written)
      .toContain(`import { Maybe as __tinkerMaybe } from "@tinker/functional";`);
    expect(output.logs)
      .toEqual([`Compiled 1 file(s) into ${outDir}.`]);
  });

  test("copies a file with nothing to emit as it is", async () => {
    const outDir = outputDirectory();
    const code = await emitFiles({ outDir, files: [fixture("no-selector.ts")], strict: false }, recording());
    expect(code)
      .toBe(0);
    expect(readFileSync(writtenAt(outDir, "no-selector.ts"), "utf8"))
      .toBe(readFileSync(fixture("no-selector.ts"), "utf8"));
  });

  test("a file that does not compile is reported, nothing is written for it, and the result is 1", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("broken.ts"), fixture("item.ts")], strict: false }, output);
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

  test("in strict mode, a component that cannot be checked fails the file", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("dynamic.ts")], strict: true }, output);
    expect(code)
      .toBe(1);
    expect(output.errors)
      .toEqual(["dynamic.ts: <Dynamic> cannot be checked: its template is not a literal"]);
  });

  test("a file that cannot be read is reported, and the result is 1", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("missing.ts")], strict: false }, output);
    expect(code)
      .toBe(1);
    expect(output.errors[0])
      .toContain("ENOENT");
  });

  test("finds the relative imports of a file on disk, to emit its templates", async () => {
    const outDir = outputDirectory();
    const code = await emitFiles({ outDir, files: [fixture("importer.ts")], strict: false }, recording());
    expect(code)
      .toBe(0);
    expect(readFileSync(writtenAt(outDir, "importer.ts"), "utf8"))
      .toContain("__tinkerSelector");
  });

  test("a component that cannot be checked is warned about, and the file is still written", async () => {
    const outDir = outputDirectory();
    const output = recording();
    const code = await emitFiles({ outDir, files: [fixture("dynamic.ts")], strict: false }, output);
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
    const code = await emitFiles({ outDir, files: [path], strict: false }, output);
    expect(code)
      .toBe(1);
    expect(output.errors)
      .toEqual([`${path} is outside the working directory: it cannot be written under the output`]);
  });
});

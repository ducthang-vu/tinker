import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run } from "./cli.ts";

describe("tinker command", () => {
  let parent: string;
  let logged: string[];
  let errors: string[];
  const output = {
    log: (line: string) => logged.push(line),
    error: (line: string) => errors.push(line),
  };

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "tinker-cli-"));
    logged = [];
    errors = [];
  });

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  test("new writes the app into --dir and reports it", () => {
    const code = run(["new", "my-app", "--dir", parent], output);

    expect(code)
      .toBe(0);
    expect(readFileSync(join(parent, "my-app", "package.json"), "utf8"))
      .toContain(`"name": "my-app"`);
    expect(logged[0])
      .toContain(join(parent, "my-app"));
    expect(errors)
      .toEqual([]);
  });

  test("new writes into the current folder when --dir is not given", () => {
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      expect(run(["new", "here-app"], output))
        .toBe(0);
      expect(readFileSync(join(parent, "here-app", "index.html"), "utf8"))
        .toContain("here-app");
    } finally {
      process.chdir(cwd);
    }
  });

  test("with no command, prints the usage and fails", () => {
    expect(run([], output))
      .toBe(2);
    expect(errors)
      .toEqual(["Usage: tinker new <name> [--dir <parent>]"]);
  });

  test("an unknown command fails and names it", () => {
    expect(run(["build"], output))
      .toBe(2);
    expect(errors[0])
      .toContain(`Unknown command "build"`);
  });

  test("new without a name fails with the usage", () => {
    expect(run(["new"], output))
      .toBe(2);
    expect(errors)
      .toEqual(["Usage: tinker new <name> [--dir <parent>]"]);
  });

  test("new with more than one name fails with the usage", () => {
    expect(run(["new", "a", "b", "--dir", parent], output))
      .toBe(2);
    expect(errors)
      .toEqual(["Usage: tinker new <name> [--dir <parent>]"]);
  });

  test("an unknown option fails, with the parser's message", () => {
    expect(run(["new", "my-app", "--force"], output))
      .toBe(2);
    expect(errors[0])
      .toContain("--force");
  });

  test("an invalid name fails with the reason, and writes nothing", () => {
    expect(run(["new", "Bad", "--dir", parent], output))
      .toBe(2);
    expect(errors[0])
      .toContain("is not a valid app name");
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { run } from "./cli.ts";
import { buildApp, serveApp } from "./vite-commands.ts";

vi.mock("./vite-commands.ts", () => ({
  buildApp: vi.fn(async () => undefined),
  serveApp: vi.fn(async () => undefined),
}));

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev | tinker build";

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
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  describe("new", () => {
    test("writes the app into --dir and reports it", async () => {
      const code = await run(["new", "my-app", "--dir", parent], output);

      expect(code)
        .toBe(0);
      expect(readFileSync(join(parent, "my-app", "package.json"), "utf8"))
        .toContain(`"name": "my-app"`);
      expect(logged[0])
        .toContain(join(parent, "my-app"));
      expect(errors)
        .toEqual([]);
    });

    test("writes into the current folder when --dir is not given", async () => {
      const cwd = process.cwd();
      process.chdir(parent);
      try {
        expect(await run(["new", "here-app"], output))
          .toBe(0);
        expect(readFileSync(join(parent, "here-app", "index.html"), "utf8"))
          .toContain("here-app");
      } finally {
        process.chdir(cwd);
      }
    });

    test("without a name fails with the usage", async () => {
      expect(await run(["new"], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
    });

    test("with more than one name fails with the usage", async () => {
      expect(await run(["new", "a", "b", "--dir", parent], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
    });

    test("an unknown option fails, with the parser's message", async () => {
      expect(await run(["new", "my-app", "--force"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--force");
    });

    test("an invalid name fails with the reason, and writes nothing", async () => {
      expect(await run(["new", "Bad", "--dir", parent], output))
        .toBe(2);
      expect(errors[0])
        .toContain("is not a valid app name");
    });
  });

  describe("dev and build", () => {
    test("dev serves the app in the current folder", async () => {
      expect(await run(["dev"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd());
      expect(buildApp).not.toHaveBeenCalled();
    });

    test("build builds the app in the current folder", async () => {
      expect(await run(["build"], output))
        .toBe(0);
      expect(buildApp)
        .toHaveBeenCalledWith(process.cwd());
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("a failure of dev or build is reported, with exit code 1", async () => {
      vi.mocked(buildApp)
        .mockRejectedValueOnce(new Error("Failed to load config"));

      expect(await run(["build"], output))
        .toBe(1);
      expect(errors)
        .toEqual(["Failed to load config"]);
    });

    test("dev with an argument fails with the usage", async () => {
      expect(await run(["dev", "extra"], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
      expect(serveApp).not.toHaveBeenCalled();
    });
  });

  test("with no command, prints the usage and fails", async () => {
    expect(await run([], output))
      .toBe(2);
    expect(errors)
      .toEqual([USAGE]);
  });

  test("an unknown command fails and names it", async () => {
    expect(await run(["deploy"], output))
      .toBe(2);
    expect(errors[0])
      .toContain(`Unknown command "deploy"`);
  });
});

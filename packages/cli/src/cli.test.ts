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

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev [--port <n>] | tinker build";

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

  describe("dev", () => {
    test("serves the app in the current folder, on the default port", async () => {
      expect(await run(["dev"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd(), { port: undefined });
      expect(buildApp).not.toHaveBeenCalled();
    });

    test("takes --port, and -p as its short form", async () => {
      expect(await run(["dev", "--port", "5000"], output))
        .toBe(0);
      expect(await run(["dev", "-p", "5001"], output))
        .toBe(0);
      expect(await run(["dev", "--port=5002"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenNthCalledWith(1, process.cwd(), { port: 5000 });
      expect(serveApp)
        .toHaveBeenNthCalledWith(2, process.cwd(), { port: 5001 });
      expect(serveApp)
        .toHaveBeenNthCalledWith(3, process.cwd(), { port: 5002 });
    });

    test.each(["abc", "0", "65536", "80.5", ""])("refuses the port %j", async (port) => {
      expect(await run(["dev", "--port", port], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--port must be a number from 1 to 65535");
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("a negative port is refused", async () => {
      expect(await run(["dev", "--port=-1"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--port must be a number from 1 to 65535");
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("--port with no value fails with the parser's message", async () => {
      expect(await run(["dev", "--port"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--port");
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("an unknown option fails", async () => {
      expect(await run(["dev", "--host", "0.0.0.0"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--host");
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("a positional argument fails with the usage", async () => {
      expect(await run(["dev", "extra"], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("a failure is reported, with exit code 1", async () => {
      vi.mocked(serveApp)
        .mockRejectedValueOnce(new Error("Port 5000 is in use"));

      expect(await run(["dev", "--port", "5000"], output))
        .toBe(1);
      expect(errors)
        .toEqual(["Port 5000 is in use"]);
    });
  });

  describe("build", () => {
    test("builds the app in the current folder", async () => {
      expect(await run(["build"], output))
        .toBe(0);
      expect(buildApp)
        .toHaveBeenCalledWith(process.cwd());
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("refuses any argument, with the usage", async () => {
      expect(await run(["build", "--outDir", "x"], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
      expect(buildApp).not.toHaveBeenCalled();
    });

    test("a failure is reported, with exit code 1", async () => {
      vi.mocked(buildApp)
        .mockRejectedValueOnce(new Error("Failed to load config"));

      expect(await run(["build"], output))
        .toBe(1);
      expect(errors)
        .toEqual(["Failed to load config"]);
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

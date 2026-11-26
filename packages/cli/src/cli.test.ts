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

const USAGE = "Usage: tinker new <name> [--dir <parent>] | tinker dev [--port <n>] [--base <path>] | tinker build [--base <path>]";

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
    test("serves the app in the current folder, on the default port and base", async () => {
      expect(await run(["dev"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd(), { port: undefined, base: undefined });
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
        .toHaveBeenNthCalledWith(1, process.cwd(), { port: 5000, base: undefined });
      expect(serveApp)
        .toHaveBeenNthCalledWith(2, process.cwd(), { port: 5001, base: undefined });
      expect(serveApp)
        .toHaveBeenNthCalledWith(3, process.cwd(), { port: 5002, base: undefined });
    });

    test("takes --base, and passes it on", async () => {
      expect(await run(["dev", "--base", "/tinker/"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd(), { port: undefined, base: "/tinker/" });
    });

    test("takes --port and --base together", async () => {
      expect(await run(["dev", "--port", "5000", "--base", "/app/"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd(), { port: 5000, base: "/app/" });
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

    test.each(["tinker/", "/tinker", "tinker", "/a/b"])("refuses the base %j, which must start and end with /", async (base) => {
      expect(await run(["dev", "--base", base], output))
        .toBe(2);
      expect(errors[0])
        .toContain(`--base must start and end with "/"`);
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("accepts a base with several folders", async () => {
      expect(await run(["dev", "--base", "/a/b/"], output))
        .toBe(0);
      expect(serveApp)
        .toHaveBeenCalledWith(process.cwd(), { port: undefined, base: "/a/b/" });
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
    test("builds the app in the current folder, at the root base", async () => {
      expect(await run(["build"], output))
        .toBe(0);
      expect(buildApp)
        .toHaveBeenCalledWith(process.cwd(), { base: undefined });
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("takes --base, and passes it on", async () => {
      expect(await run(["build", "--base", "/tinker/"], output))
        .toBe(0);
      expect(buildApp)
        .toHaveBeenCalledWith(process.cwd(), { base: "/tinker/" });
    });

    test("refuses a base that does not start and end with /", async () => {
      expect(await run(["build", "--base", "tinker"], output))
        .toBe(2);
      expect(errors[0])
        .toContain(`--base must start and end with "/"`);
      expect(buildApp).not.toHaveBeenCalled();
    });

    test("refuses an option it does not take, with the parser's message", async () => {
      expect(await run(["build", "--port", "5000"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("--port");
      expect(buildApp).not.toHaveBeenCalled();
    });

    test("a positional argument fails with the usage", async () => {
      expect(await run(["build", "extra"], output))
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

// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { findVersion, run } from "./cli.ts";
import { createApp } from "./new.ts";
import { buildApp, previewApp, serveApp } from "./vite-commands.ts";

vi.mock("./vite-commands.ts", () => ({
  buildApp: vi.fn(async () => undefined),
  previewApp: vi.fn(async () => undefined),
  serveApp: vi.fn(async () => undefined),
}));

const USAGE = "Usage: tinker new <name> [--dir <parent>] [--prefix <prefix>] [--test-runner <vitest|node>] | tinker dev [--port <n>] [--base <path>] | tinker build [--base <path>] | tinker preview [--port <n>] [--base <path>] | tinker generate <kind> <name>";

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

    test("--prefix sets the selectors of the app, and the default is app", async () => {
      expect(await run(["new", "my-app", "--dir", parent, "--prefix", "shop"], output))
        .toBe(0);
      expect(await run(["new", "other-app", "--dir", parent], output))
        .toBe(0);
      expect(readFileSync(join(parent, "my-app", "index.html"), "utf8"))
        .toContain("<shop-app></shop-app>");
      expect(readFileSync(join(parent, "my-app", "src", "app.ts"), "utf8"))
        .toContain(`selector: "shop-app"`);
      expect(JSON.parse(readFileSync(join(parent, "my-app", "tinker.json"), "utf8")))
        .toMatchObject({ prefix: "shop" });
      expect(readFileSync(join(parent, "other-app", "index.html"), "utf8"))
        .toContain("<app-app></app-app>");
    });

    test("--test-runner sets the runner, and vitest is the default", async () => {
      expect(await run(["new", "node-app", "--dir", parent, "--test-runner", "node"], output))
        .toBe(0);
      expect(await run(["new", "vitest-app", "--dir", parent], output))
        .toBe(0);
      expect(JSON.parse(readFileSync(join(parent, "node-app", "tinker.json"), "utf8")).testRunner)
        .toBe("node");
      expect(JSON.parse(readFileSync(join(parent, "vitest-app", "tinker.json"), "utf8")).testRunner)
        .toBeUndefined();
      expect(existsSync(join(parent, "node-app", "register.mjs")))
        .toBe(true);
      expect(existsSync(join(parent, "vitest-app", "register.mjs")))
        .toBe(false);
    });

    test("an unknown test runner fails with the reason, and writes nothing", async () => {
      expect(await run(["new", "my-app", "--dir", parent, "--test-runner", "jest"], output))
        .toBe(2);
      expect(errors[0])
        .toContain(`"jest" is not a test runner`);
    });

    test("an invalid prefix fails with the reason, and writes nothing", async () => {
      expect(await run(["new", "my-app", "--dir", parent, "--prefix", "My-Shop"], output))
        .toBe(2);
      expect(errors[0])
        .toContain("is not a valid prefix");
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

  describe("preview", () => {
    test("serves the built app in the current folder, on the default port and base", async () => {
      expect(await run(["preview"], output))
        .toBe(0);
      expect(previewApp)
        .toHaveBeenCalledWith(process.cwd(), { port: undefined, base: undefined });
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("takes --port, -p and --base", async () => {
      expect(await run(["preview", "-p", "4173", "--base", "/app/"], output))
        .toBe(0);
      expect(previewApp)
        .toHaveBeenCalledWith(process.cwd(), { port: 4173, base: "/app/" });
    });

    test("refuses an invalid port, and a positional argument", async () => {
      expect(await run(["preview", "--port", "abc"], output))
        .toBe(2);
      expect(await run(["preview", "extra"], output))
        .toBe(2);
      expect(previewApp).not.toHaveBeenCalled();
    });

    test("a failure, such as a missing build, is reported with exit code 1", async () => {
      vi.mocked(previewApp)
        .mockRejectedValueOnce(new Error("There is no dist folder"));

      expect(await run(["preview"], output))
        .toBe(1);
      expect(errors)
        .toEqual(["There is no dist folder"]);
    });
  });

  describe("help and version", () => {
    test("with no command, prints the help and succeeds", async () => {
      expect(await run([], output))
        .toBe(0);
      expect(logged[0])
        .toContain("Commands:");
      expect(logged[0])
        .toContain("-v, --version");
      expect(errors)
        .toEqual([]);
    });

    test("--help, -h and help print the help", async () => {
      for (const flag of ["--help", "-h", "help"]) {
        logged = [];
        expect(await run([flag], output))
          .toBe(0);
        expect(logged[0])
          .toContain("Commands:");
      }
    });

    test("--help after a command prints the help, and runs nothing", async () => {
      expect(await run(["dev", "--help"], output))
        .toBe(0);
      expect(logged[0])
        .toContain("Options:");
      expect(serveApp).not.toHaveBeenCalled();
    });

    test("findVersion walks up to the package, and fails outside any", () => {
      const inside = mkdtempSync(join(tmpdir(), "tinker-version-"));
      try {
        mkdirSync(join(inside, "dist", "assets"), { recursive: true });
        writeFileSync(join(inside, "package.json"), JSON.stringify({ name: "@tinker/cli", version: "9.9.9" }));
        expect(findVersion(join(inside, "dist", "assets")))
          .toBe("9.9.9");
      } finally {
        rmSync(inside, { recursive: true, force: true });
      }
      const other = mkdtempSync(join(tmpdir(), "tinker-version-"));
      try {
        mkdirSync(join(other, "inner"));
        writeFileSync(join(other, "inner", "package.json"), JSON.stringify({ name: "some-other", version: "1.0.0" }));
        expect(() => findVersion(join(other, "inner")))
          .toThrow("could not be found");
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
      const outside = mkdtempSync(join(tmpdir(), "tinker-version-"));
      try {
        expect(() => findVersion(outside))
          .toThrow("could not be found");
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    test("--version and -v print the version of the package", async () => {
      const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
      expect(await run(["--version"], output))
        .toBe(0);
      expect(await run(["-v"], output))
        .toBe(0);
      expect(logged)
        .toEqual([manifest.version, manifest.version]);
    });
  });

  describe("generate", () => {
    test("writes the item, and registers it in the root component", async () => {
      const cwd = process.cwd();
      const parent = mkdtempSync(join(tmpdir(), "tinker-gen-cmd-"));
      const app = createApp("shop", parent, "shop");
      process.chdir(app);
      try {
        expect(await run(["generate", "component", "cart"], output))
          .toBe(0);
        expect(readFileSync(join(app, "src", "cart", "cart.ts"), "utf8"))
          .toContain(`selector: "shop-cart"`);
        expect(readFileSync(join(app, "src", "app.ts"), "utf8"))
          .toContain("imports: [CartComponent],");
        expect(logged.join("\n"))
          .toContain("Registered it in src/app.ts");
      } finally {
        process.chdir(cwd);
        rmSync(parent, { recursive: true, force: true });
      }
    });

    test("--dry-run writes nothing, and shows what it would do", async () => {
      const cwd = process.cwd();
      const parent = mkdtempSync(join(tmpdir(), "tinker-gen-dry-"));
      const app = createApp("shop", parent, "shop");
      const before = readFileSync(join(app, "src", "app.ts"), "utf8");
      process.chdir(app);
      try {
        expect(await run(["generate", "component", "cart", "--dry-run"], output))
          .toBe(0);
        expect(existsSync(join(app, "src", "cart")))
          .toBe(false);
        expect(readFileSync(join(app, "src", "app.ts"), "utf8"))
          .toBe(before);
        expect(logged.join("\n"))
          .toContain("Dry run: nothing is written");
        expect(logged.join("\n"))
          .toContain("CartComponent");
      } finally {
        process.chdir(cwd);
        rmSync(parent, { recursive: true, force: true });
      }
    });

    test("a service is written, and the root component is left as it was", async () => {
      const cwd = process.cwd();
      const parent = mkdtempSync(join(tmpdir(), "tinker-gen-svc-"));
      const app = createApp("shop", parent, "shop");
      const before = readFileSync(join(app, "src", "app.ts"), "utf8");
      process.chdir(app);
      try {
        expect(await run(["generate", "service", "cart"], output))
          .toBe(0);
        expect(existsSync(join(app, "src", "cart", "cart.ts")))
          .toBe(true);
        expect(readFileSync(join(app, "src", "app.ts"), "utf8"))
          .toBe(before);
        expect(logged.join("\n")).not.toContain("Registered");
      } finally {
        process.chdir(cwd);
        rmSync(parent, { recursive: true, force: true });
      }
    });

    test("a dry run of a service plans its file, and no change to the root component", async () => {
      const cwd = process.cwd();
      const parent = mkdtempSync(join(tmpdir(), "tinker-gen-svc-dry-"));
      const app = createApp("shop", parent, "shop");
      process.chdir(app);
      try {
        expect(await run(["generate", "service", "cart", "--dry-run"], output))
          .toBe(0);
        expect(existsSync(join(app, "src", "cart")))
          .toBe(false);
        expect(logged.join("\n")).not.toContain("and change");
      } finally {
        process.chdir(cwd);
        rmSync(parent, { recursive: true, force: true });
      }
    });

    test("a wrong number of arguments fails with the usage", async () => {
      expect(await run(["generate", "component"], output))
        .toBe(2);
      expect(errors)
        .toEqual([USAGE]);
    });

    test("an error in the item fails with the reason", async () => {
      expect(await run(["generate", "pipe", "cart"], output))
        .toBe(2);
      expect(errors[0])
        .toContain(`"pipe" is not a kind to generate`);
    });
  });

  test("an unknown command fails and names it", async () => {
    expect(await run(["deploy"], output))
      .toBe(2);
    expect(errors[0])
      .toContain(`Unknown command "deploy"`);
  });
});

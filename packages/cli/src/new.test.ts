import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "./new.ts";

describe("createApp", () => {
  let parent: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "tinker-new-"));
  });

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  test("writes the app's files into a new folder named after it", () => {
    const folder = createApp("my-app", parent);

    expect(folder)
      .toBe(join(parent, "my-app"));
    for (const file of ["package.json", "index.html", "vite.config.ts", "src/main.ts", "src/app.ts", "tsconfig.json", "tinker.json", ".gitignore", "README.md"]) {
      expect(readFileSync(join(folder, file), "utf8")).not.toBe("");
    }
  });

  test("the package is named after the app, and depends on the Tinker packages", () => {
    const folder = createApp("my-app", parent);
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));

    expect(manifest.name)
      .toBe("my-app");
    expect(manifest.dependencies["@tinker/core"])
      .toBe("*");
    expect(manifest.devDependencies["@tinker/compiler"])
      .toBe("*");
  });

  test("the app ignores its packages and build, and documents its commands", () => {
    const folder = createApp("my-app", parent);

    expect(readFileSync(join(folder, ".gitignore"), "utf8"))
      .toContain("node_modules/");
    expect(readFileSync(join(folder, ".gitignore"), "utf8"))
      .toContain("dist/");
    expect(readFileSync(join(folder, "README.md"), "utf8"))
      .toContain("# my-app");
    expect(readFileSync(join(folder, "README.md"), "utf8"))
      .toContain("npm run typecheck");
  });

  test("the tests run with Node's built-in runner, through the loader of the app", () => {
    const folder = createApp("my-app", parent, "app", "node");
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));

    expect(manifest.scripts.test)
      .toContain("--import ./register.mjs --test");
    expect(manifest.devDependencies["@babel/plugin-transform-typescript"])
      .toBeDefined();
    expect(manifest.devDependencies["@types/node"])
      .toBeDefined();
    expect(readFileSync(join(folder, "hooks.mjs"), "utf8"))
      .toContain("export async function load");
  });

  test("vitest is the default runner: its script, its dependency, and no loader", () => {
    const folder = createApp("my-app", parent);
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));

    expect(manifest.scripts.test)
      .toBe("vitest run");
    expect(manifest.devDependencies.vitest)
      .toBeDefined();
    expect(manifest.devDependencies["@babel/core"])
      .toBeUndefined();
    expect(existsSync(join(folder, "hooks.mjs")))
      .toBe(false);
  });

  test("an unknown runner is refused, and nothing is written", () => {
    expect(() => createApp("my-app", parent, "app", "jest" as never))
      .toThrow(`"jest" is not a test runner`);
    expect(existsSync(join(parent, "my-app")))
      .toBe(false);
  });

  test("the node runner declares the Node version it needs", () => {
    const folder = createApp("my-app", parent, "app", "node");
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));

    expect(manifest.engines)
      .toEqual({ node: ">=22.6" });
  });

  test("the vitest app does not declare an engine", () => {
    const folder = createApp("my-app", parent);
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));

    expect(manifest.engines)
      .toBeUndefined();
  });

  test("the compiler settings are strict, and allow the .ts import paths", () => {
    const folder = createApp("my-app", parent);
    const tsconfig = JSON.parse(readFileSync(join(folder, "tsconfig.json"), "utf8"));

    expect(tsconfig.compilerOptions.strict)
      .toBe(true);
    expect(tsconfig.compilerOptions.allowImportingTsExtensions)
      .toBe(true);
    expect(tsconfig.include)
      .toEqual(["src", "vite.config.ts"]);
  });

  test("the root component uses the app's name as its title", () => {
    const folder = createApp("my-app", parent);

    expect(readFileSync(join(folder, "src/app.ts"), "utf8"))
      .toContain(`title = "my-app"`);
    expect(readFileSync(join(folder, "index.html"), "utf8"))
      .toContain("<title>my-app</title>");
  });

  test("writes into an existing empty folder", () => {
    mkdirSync(join(parent, "my-app"));

    expect(() => createApp("my-app", parent)).not.toThrow();
  });

  test("refuses a folder that already has files, and writes nothing", () => {
    mkdirSync(join(parent, "my-app"));
    writeFileSync(join(parent, "my-app", "keep.txt"), "mine");

    expect(() => createApp("my-app", parent))
      .toThrow(/already exists and is not empty/);
    expect(readFileSync(join(parent, "my-app", "keep.txt"), "utf8"))
      .toBe("mine");
  });

  test.each(["", "My-App", "1app", "my_app", "my app"])("refuses the name %j", (name) => {
    expect(() => createApp(name, parent))
      .toThrow(/is not a valid app name/);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    for (const file of ["package.json", "index.html", "vite.config.ts", "src/main.ts", "src/app.ts"]) {
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

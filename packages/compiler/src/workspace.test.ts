// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformAsync } from "@babel/core";
import { afterAll, describe, expect, test, vi } from "vitest";
import { standardDecorators, workspaceAliases, workspacePackages } from "./workspace.ts";

vi.mock("@babel/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@babel/core")>();
  return { ...original, transformAsync: vi.fn(original.transformAsync) };
});

/** The transform of the decorators step, called as Vite calls it. */
async function transform(code: string, id: string): Promise<{ code: string } | null> {
  const hook = standardDecorators().transform as (code: string, id: string) => Promise<unknown>;
  return (await hook(code, id)) as { code: string } | null;
}

describe("standardDecorators", () => {
  test("rewrites the decorators of a TypeScript file", async () => {
    const result = await transform(`@Component({ selector: "x" })\nexport class A {}\n`, "/app/a.ts");

    expect(result?.code).not.toContain("@Component");
    expect(result?.code)
      .toContain("class A");
  });

  test("rewrites a TSX file too", async () => {
    const result = await transform(`@Component({ selector: "x" })\nexport class A {}\n`, "/app/a.tsx");

    expect(result?.code).not.toContain("@Component");
  });

  test("leaves a file that is not TypeScript alone", async () => {
    expect(await transform(`@Component({})\nclass A {}\n`, "/app/a.js"))
      .toBeNull();
  });

  test("leaves a dependency alone", async () => {
    expect(await transform(`@Component({})\nclass A {}\n`, "/app/node_modules/x/a.ts"))
      .toBeNull();
  });

  test("leaves a file alone when Babel gives no code", async () => {
    vi.mocked(transformAsync)
      .mockResolvedValueOnce(null);

    expect(await transform(`@Component({})\nclass A {}\n`, "/app/a.ts"))
      .toBeNull();
  });

  test("leaves a file with no decorator alone", async () => {
    expect(await transform(`export const a = 1;\n`, "/app/a.ts"))
      .toBeNull();
  });
});

describe("workspaceAliases", () => {
  const aliases = workspaceAliases(workspacePackages);
  const folders: string[] = [];

  afterAll(() => {
    for (const folder of folders) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("a package with no exports gives no alias, and one with a plain string gives one", () => {
    const packages = mkdtempSync(join(tmpdir(), "tinker-aliases-"));
    folders.push(packages);
    mkdirSync(join(packages, "bare"));
    writeFileSync(join(packages, "bare", "package.json"), JSON.stringify({ name: "@tinker/bare" }));
    mkdirSync(join(packages, "plain"));
    writeFileSync(join(packages, "plain", "package.json"), JSON.stringify({
      name: "@tinker/plain",
      exports: { ".": "./src/index.ts" },
    }));

    const found = workspaceAliases(new URL(`file://${packages}/`));

    expect(found.map(({ replacement }) => replacement))
      .toEqual([
        expect.stringMatching(/plain\/src\/index\.ts$/),
      ]);
  });

  const resolve = (specifier: string): string | undefined => {
    const match = aliases.find(({ find }) => find.test(specifier));
    return match?.replacement;
  };

  test("maps a workspace package to its source, by its name", () => {
    expect(resolve("@tinker/core"))
      .toMatch(/packages\/core\/src\/index\.ts$/);
  });

  test("maps an exported subpath to its own source", () => {
    expect(resolve("@tinker/core/compiler"))
      .toMatch(/packages\/core\/src\/view\/compiler\/index\.ts$/);
  });

  test("does not map a package that is not in the workspace", () => {
    expect(resolve("@tinker/unknown"))
      .toBeUndefined();
  });

  test("maps a package whose export is a plain string", () => {
    expect(aliases.length)
      .toBeGreaterThan(2);
  });
});

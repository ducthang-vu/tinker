import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRepoMap, renderAllMarkdown, renderRepoMapMarkdown, scopesOf } from "./repo-map.mjs";

test("builds a deterministic graph of files, imports, and exported symbols", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "tinker-repo-map-"));

  try {
    mkdirSync(path.join(rootDir, "src"), { recursive: true });
    writeFileSync(
      path.join(rootDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
        },
        include: ["src"],
      }),
    );
    writeFileSync(
      path.join(rootDir, "src", "math.ts"),
      "/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n"
      + "  return a + b;\n}\n",
    );
    writeFileSync(
      path.join(rootDir, "src", "index.ts"),
      "export { add } from \"./math\";\nimport { readFile } from \"node:fs\";\n",
    );
    writeFileSync(
      path.join(rootDir, "src", "math.test.ts"),
      "export const testOnly = true;\n",
    );
    writeFileSync(
      path.join(rootDir, "src", "math.template-check.ts"),
      "export const generated = true;\n",
    );

    const graph = buildRepoMap(rootDir);
    const indexId = "file:src/index.ts";
    const mathId = "file:src/math.ts";
    const symbolId = "symbol:src/math.ts#add";

    assert.equal(graph.schemaVersion, 2);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      [...graph.nodes.map((node) => node.id)].sort(),
    );
    assert.equal(graph.nodes.some((node) => node.id === "file:src/math.test.ts"), false);
    assert.equal(graph.nodes.some((node) => node.id === "file:src/math.template-check.ts"), false);
    assert.deepEqual(
      graph.nodes.find((node) => node.id === symbolId),
      {
        id: symbolId,
        type: "symbol",
        name: "add",
        kind: "FunctionDeclaration",
        definedIn: "src/math.ts",
        signature: "(a: number, b: number) => number",
        documentation: "Adds two numbers.",
      },
    );
    assert.ok(graph.edges.some((edge) =>
      edge.from === indexId && edge.to === mathId && edge.type === "imports",
    ));
    assert.ok(graph.edges.some((edge) =>
      edge.from === indexId && edge.to === symbolId && edge.type === "exports",
    ));
    assert.ok(graph.nodes.some((node) =>
      node.id === "module:node:fs" && node.type === "module",
    ));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("reports a helpful error when no tsconfig exists", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "tinker-repo-map-"));

  try {
    assert.throws(
      () => buildRepoMap(rootDir),
      /No tsconfig.json found/,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("renders a compact Markdown view with imports and exported API", () => {
  const graph = {
    schemaVersion: 2,
    nodes: [
      { id: "file:src/index.ts", type: "file", path: "src/index.ts" },
      { id: "file:src/math.ts", type: "file", path: "src/math.ts" },
      { id: "module:node:fs", type: "module", name: "node:fs" },
      {
        id: "symbol:src/math.ts#add",
        type: "symbol",
        name: "add",
        kind: "FunctionDeclaration",
        definedIn: "src/math.ts",
        signature: "(a: number, b: number) => number",
        documentation: "Adds two numbers.",
      },
    ],
    edges: [
      { from: "file:src/index.ts", to: "file:src/math.ts", type: "imports" },
      { from: "file:src/index.ts", to: "module:node:fs", type: "imports" },
      { from: "file:src/index.ts", to: "symbol:src/math.ts#add", type: "exports" },
    ],
  };

  const markdown = renderRepoMapMarkdown(graph);

  assert.match(markdown, /files:2 symbols:1 external:1/);
  assert.match(markdown, /^src\/index\.ts <- pkg:node:fs,src\/math\.ts$/m);
  assert.match(markdown, /^  add: \(a: number, b: number\) => number@src\/math\.ts$/m);
  assert.doesNotMatch(markdown, /Adds two numbers/);
  assert.match(renderRepoMapMarkdown(graph, { includeDocs: true }), /Adds two numbers/);
});

test("keeps each export on its own line, whatever its signature or docs contain", () => {
  const graph = {
    schemaVersion: 2,
    nodes: [
      { id: "file:src/x.ts", type: "file", path: "src/x.ts" },
      {
        id: "symbol:src/x.ts#over",
        type: "symbol",
        name: "over",
        kind: "VariableDeclaration",
        definedIn: "src/x.ts",
        signature: "{ <T>(a: T): T;\n  <T>(b: T): T; }",
        documentation: "Two\nlines; with | pipes.",
      },
      {
        id: "symbol:src/x.ts#union",
        type: "symbol",
        name: "union",
        kind: "TypeAliasDeclaration",
        definedIn: "src/x.ts",
        signature: "string | undefined",
      },
    ],
    edges: [
      { from: "file:src/x.ts", to: "symbol:src/x.ts#over", type: "exports" },
      { from: "file:src/x.ts", to: "symbol:src/x.ts#union", type: "exports" },
    ],
  };

  const markdown = renderRepoMapMarkdown(graph, { includeDocs: true });

  assert.match(markdown, /^  over: \{ <T>\(a: T\): T; <T>\(b: T\): T; \}$/m);
  assert.match(markdown, /^    Two lines; with \| pipes\.$/m);
  assert.match(markdown, /^  union: string \| undefined$/m);
});

test("gives each package its own map, and the root the files outside the packages", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "repo-map-scopes-"));
  try {
    const write = (file, content) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };
    write("tsconfig.json", JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", target: "es2022" }, include: ["packages", "scripts"] }));
    write("packages/a/package.json", "{}");
    write("packages/a/src/x.ts", "export const x = 1;\n");
    write("scripts/run.ts", "export const run = 2;\n");

    assert.deepEqual(scopesOf(root), ["packages/a"]);
    const maps = renderAllMarkdown(buildRepoMap(root), scopesOf(root));
    assert.deepEqual([...maps.keys()], [".repo-map.md", "packages/a/.repo-map.md"]);
    assert.match(maps.get(".repo-map.md"), /scripts\/run\.ts/);
    assert.doesNotMatch(maps.get(".repo-map.md"), /packages\/a\/src\/x\.ts/);
    assert.match(maps.get("packages/a/.repo-map.md"), /packages\/a\/src\/x\.ts/);
    assert.doesNotMatch(maps.get("packages/a/.repo-map.md"), /scripts\/run\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("splits packages/core into a map per top-level module, each file in its most specific map", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "repo-map-modules-"));
  try {
    const write = (file, content) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };
    write("tsconfig.json", JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", target: "es2022" }, include: ["packages"] }));
    write("packages/core/package.json", "{}");
    write("packages/core/src/index.ts", "export * from './signals/index.ts';\n");
    write("packages/core/src/signals/index.ts", "export const sig = 1;\n");
    write("packages/core/src/di/index.ts", "export const di = 2;\n");
    write("packages/core/src/view/index.ts", "export const view = 3;\n");

    assert.deepEqual(scopesOf(root), [
      "packages/core",
      "packages/core/src/di",
      "packages/core/src/signals",
      "packages/core/src/view",
    ]);
    const maps = renderAllMarkdown(buildRepoMap(root), scopesOf(root));
    assert.deepEqual([...maps.keys()], [
      ".repo-map.md",
      "packages/core/.repo-map.md",
      "packages/core/src/di/.repo-map.md",
      "packages/core/src/signals/.repo-map.md",
      "packages/core/src/view/.repo-map.md",
    ]);
    assert.match(maps.get("packages/core/src/signals/.repo-map.md"), /packages\/core\/src\/signals\/index\.ts/);
    assert.doesNotMatch(maps.get("packages/core/.repo-map.md"), /^packages\/core\/src\/signals\/index\.ts/m);
    assert.match(maps.get("packages/core/.repo-map.md"), /packages\/core\/src\/index\.ts/);
    assert.doesNotMatch(maps.get(".repo-map.md"), /packages\/core/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a JSON import is an external reference, whether or not the file exists", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "tinker-repo-map-json-"));
  try {
    mkdirSync(path.join(rootDir, "src"), { recursive: true });
    writeFileSync(
      path.join(rootDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true },
        include: ["src"],
      }),
    );
    writeFileSync(
      path.join(rootDir, "src", "index.ts"),
      "import data from \"./data.json\";\nexport const value: unknown = data;\n",
    );
    const absent = renderRepoMapMarkdown(buildRepoMap(rootDir));
    writeFileSync(path.join(rootDir, "src", "data.json"), "{}");
    const present = renderRepoMapMarkdown(buildRepoMap(rootDir));
    assert.equal(present, absent);
    assert.doesNotMatch(present, /data\.json <-|^src\/data\.json$/m);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRepoMap } from "./repo-map.mjs";

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
      "/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n" +
        "  return a + b;\n}\n",
    );
    writeFileSync(
      path.join(rootDir, "src", "index.ts"),
      'export { add } from "./math";\nimport { readFile } from "node:fs";\n',
    );
    writeFileSync(
      path.join(rootDir, "src", "math.test.ts"),
      "export const testOnly = true;\n",
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

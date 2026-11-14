import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRepoMap } from "./repo-map.mjs";

test("builds a compact map of source files, exports, and local imports", () => {
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
      'export { add } from "./math";\n',
    );
    writeFileSync(
      path.join(rootDir, "src", "math.test.ts"),
      "export const testOnly = true;\n",
    );

    const repoMap = buildRepoMap(rootDir);
    const indexFile = repoMap.files.find((file) => file.path === "src/index.ts");
    const mathFile = repoMap.files.find((file) => file.path === "src/math.ts");

    assert.equal(repoMap.schemaVersion, 1);
    assert.equal(repoMap.files.length, 2);
    assert.deepEqual(indexFile.imports, [
      { source: "./math", resolved: "src/math.ts" },
    ]);
    assert.equal(indexFile.exports[0].name, "add");
    assert.equal(indexFile.exports[0].definedIn, "src/math.ts");
    assert.equal(mathFile.exports[0].name, "add");
    assert.match(mathFile.exports[0].type, /number/);
    assert.equal(mathFile.exports[0].documentation, "Adds two numbers.");
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

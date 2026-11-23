import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildApiReference, publicEntries } from "./api-docs.mjs";

const SCRIPT = fileURLToPath(new URL("./api-docs.mjs", import.meta.url));

function project(files) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "tinker-api-docs-"));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(rootDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return rootDir;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
  include: ["packages"],
});

const LIBRARY = {
  "tsconfig.json": TSCONFIG,
  "packages/demo/package.json": JSON.stringify({
    name: "@demo/lib",
    exports: {
      ".": { development: "./src/index.ts" },
      "./extra": "./src/extra.ts",
    },
  }),
  "packages/demo/src/index.ts": [
    "export * from \"./counter.ts\";",
    "export { helper as renamed } from \"./helpers.ts\";",
    "export { legacy } from \"./helpers.ts\";",
    "export { Hidden } from \"./helpers.ts\";",
    "export { Shape } from \"./helpers.ts\";",
    "export { Mode } from \"./helpers.ts\";",
    "export { Frozen } from \"./helpers.ts\";",
    "export { Tagged } from \"./helpers.ts\";",
    "export { Shown } from \"./helpers.ts\";",
    "export const VERSION = \"1.0\";",
    "",
  ].join("\n"),
  "packages/demo/src/counter.ts": [
    "/**",
    " * A counter that counts.",
    " * @final",
    " */",
    "export class Counter {",
    "  /** The current count. */",
    "  count = 0;",
    "  /**",
    "   * Adds an amount.",
    "   * @param amount - how much to add",
    "   * @returns the new count",
    "   * @public",
    "   */",
    "  add(amount: number): number {",
    "    this.count += amount;",
    "    return this.count;",
    "  }",
    "  /** @protected For subclasses only. */",
    "  protected reset(): void {}",
    "  /** @privateAPI Not for apps. */",
    "  peek(): number { return this.count; }",
    "  private secret(): void {}",
    "  #hidden = 1;",
    "  /** @internal */",
    "  internalStep(): void {}",
    "  /** The number of adds. Inherited members are not listed. */",
    "  static created = 0;",
    "}",
    "/** A counter that keeps a tally: it inherits the members of Counter. */",
    "export class Tally extends Counter {",
    "  /** Its own member. */",
    "  label = \"tally\";",
    "}",
    "",
  ].join("\n"),
  "packages/demo/src/helpers.ts": [
    "/**",
    " * Doubles a number.",
    " * @param value the input",
    " * @example",
    " * ```ts",
    " * helper(2) // 4",
    " * ```",
    " */",
    "export function helper(value: number): number { return value * 2; }",
    "/** @deprecated Use `helper` instead. */",
    "export function legacy(): void {}",
    "/** @internal */",
    "export class Hidden {}",
    "/** A shape: `circle` or `square`. */",
    "export type Shape = \"circle\" | \"square\";",
    "/** The modes. */",
    "export enum Mode { On = 1, Off = 2 }",
    "/** @final @deprecated Replaced by `Counter`. */",
    "export interface Frozen { readonly value: number }",
    "/** @privateAPI Not for apps: left out of the reference. */",
    "export const Tagged = 1;",
    "/** @public @protected Read, not shown as tags. */",
    "export const Shown = 2;",
    "",
  ].join("\n"),
  "packages/demo/src/extra.ts": "/** An extra export. */\nexport const extra = true;\n",
  "packages/empty/README.md": "No manifest here, so it is not an entry.\n",
};

test("finds one entry per exports entry, in source, with the package name as specifier", () => {
  const rootDir = project(LIBRARY);
  try {
    assert.deepEqual(
      publicEntries(rootDir)
        .map((entry) => entry.specifier),
      ["@demo/lib", "@demo/lib/extra"],
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("describes each export with its kind, signatures, type and TSDoc", () => {
  const rootDir = project(LIBRARY);
  try {
    const reference = buildApiReference(rootDir);
    const lib = reference.entries.find((entry) => entry.specifier === "@demo/lib");
    assert.ok(lib);
    const byName = Object.fromEntries(lib.exports.map((item) => [item.name, item]));

    // Exported as `renamed`: the description, params and example come from the declaration.
    assert.equal(byName.renamed.kind, "function");
    assert.deepEqual(byName.renamed.signatures, ["renamed(value: number): number"]);
    assert.equal(byName.renamed.description, "Doubles a number.");
    assert.equal(byName.renamed.params[0].name, "value");
    assert.equal(byName.renamed.params[0].text, "the input");
    assert.match(byName.renamed.examples[0], /helper\(2\) \/\/ 4/);
    assert.equal(byName.renamed.source, "packages/demo/src/helpers.ts:9");

    assert.equal(byName.VERSION.kind, "const");
    assert.equal(byName.VERSION.type, "\"1.0\"");

    assert.equal(byName.Shape.kind, "type");
    assert.match(byName.Shape.declaration, /export type Shape/);

    assert.equal(byName.Mode.kind, "enum");
    assert.deepEqual(
      byName.Mode.members.map((member) => [member.name, member.type]),
      [["On", "1"], ["Off", "2"]],
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("shows @final and @deprecated, and reads the ignored tags without showing them", () => {
  const rootDir = project(LIBRARY);
  try {
    const lib = buildApiReference(rootDir).entries[0];
    const byName = Object.fromEntries(lib.exports.map((item) => [item.name, item]));

    assert.equal(byName.Counter.final, true);
    assert.equal(byName.legacy.deprecated, "Use `helper` instead.");
    assert.equal(byName.Frozen.final, true);
    assert.equal(byName.Frozen.deprecated, "Replaced by `Counter`.");

    // @privateAPI hides the export; @public and @protected are not fields of the output.
    assert.equal(byName.Tagged, undefined);
    assert.equal(byName.Shown.public, undefined);
    assert.equal(byName.Shown.protected, undefined);
    // The text after a tag belongs to that tag, so this comment has no description.
    assert.equal(byName.Shown.description, "");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("lists public members, hides @internal, private and protected ones", () => {
  const rootDir = project(LIBRARY);
  try {
    const counter = buildApiReference(rootDir).entries[0].exports
      .find((item) => item.name === "Counter");
    const names = counter.members.map((member) => member.name);

    // peek is @privateAPI, so it is left out with the private and protected members.
    assert.deepEqual(names, ["count", "add", "created"]);
    const add = counter.members.find((member) => member.name === "add");
    assert.equal(add.kind, "method");
    assert.deepEqual(add.signatures, ["add(amount: number): number"]);
    assert.equal(add.returns, "the new count");
    assert.equal(counter.members.find((member) => member.name === "created").static, true);
    assert.equal(counter.members.find((member) => member.name === "count").type, "number");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("lists the members a class inherits from a base in the project, marked with the base", () => {
  const rootDir = project(LIBRARY);
  try {
    const tally = buildApiReference(rootDir).entries[0].exports
      .find((item) => item.name === "Tally");
    const inherited = Object.fromEntries(
      tally.members.map((member) => [member.name, member.inheritedFrom]),
    );
    // The base's public members are listed, marked with its name; the class's own member is not.
    assert.equal(inherited.count, "Counter");
    assert.equal(inherited.add, "Counter");
    assert.equal(inherited.label, undefined);
    // A protected or @privateAPI member is not listed, even when it is inherited.
    assert.equal(inherited.reset, undefined);
    assert.equal(inherited.peek, undefined);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("follows a re-export to its declaration, and drops @internal exports", () => {
  const rootDir = project(LIBRARY);
  try {
    const names = buildApiReference(rootDir).entries[0].exports.map((item) => item.name);
    assert.ok(names.includes("renamed"));
    assert.ok(!names.includes("Hidden"));
    const renamed = buildApiReference(rootDir).entries[0].exports
      .find((item) => item.name === "renamed");
    assert.equal(renamed.kind, "function");
    assert.equal(renamed.source, "packages/demo/src/helpers.ts:9");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("the command writes the reference, and --check fails until it is written", () => {
  const rootDir = project(LIBRARY);
  try {
    const run = (...args) => spawnSync(
      process.execPath,
      [SCRIPT, "--root", rootDir, "--out", "api/out.json", ...args],
      { encoding: "utf8" },
    );

    const missing = run("--check");
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /out of date: run npm run docs:api/);

    const written = run();
    assert.equal(written.status, 0);
    assert.match(written.stdout, /Wrote api\/out\.json/);

    const current = run("--check");
    assert.equal(current.status, 0);
    assert.match(current.stdout, /up to date/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("an unknown option is an error", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option --nope/);
});

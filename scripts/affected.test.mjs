import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { affectedPackages } from "./affected.mjs";

const packages = [
  { name: "@tinker/functional", dir: "packages/functional", deps: [] },
  { name: "@tinker/core", dir: "packages/core", deps: ["@tinker/functional"] },
  { name: "@tinker/other", dir: "packages/other", deps: [] },
];

describe("affectedPackages", () => {
  it("returns the package a changed file is in", () => {
    assert.deepEqual(affectedPackages(["packages/other/src/x.ts"], packages), ["packages/other"]);
  });

  it("adds the packages that depend on a changed one", () => {
    assert.deepEqual(
      affectedPackages(["packages/functional/src/maybe.ts"], packages),
      ["packages/functional", "packages/core"],
    );
  });

  it("returns every package when shared configuration changes", () => {
    assert.deepEqual(affectedPackages(["tsconfig.json"], packages), packages.map((p) => p.dir));
    assert.deepEqual(affectedPackages([".github/workflows/checks.yml"], packages), packages.map((p) => p.dir));
  });

  it("returns nothing for files outside the packages", () => {
    assert.deepEqual(affectedPackages(["README.md", "docs/architecture.md"], packages), []);
  });
});

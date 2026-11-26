// @vitest-environment node
import { describe, expect, test } from "vitest";
import { tinkerVite } from "./vite.ts";

describe("tinkerVite", () => {
  test("gives the compiler and the decorators, in that order", () => {
    const preset = tinkerVite();

    expect(preset.plugins.map((plugin) => plugin.name))
      .toEqual([
        "tinker:compile-templates",
        "tinker:standard-decorators",
      ]);
  });

  test("gives the workspace aliases, one per exported subpath of each package", () => {
    const aliases = tinkerVite().resolve?.alias;

    expect(Array.isArray(aliases))
      .toBe(true);
    expect(aliases)
      .toContainEqual(expect.objectContaining({ replacement: expect.stringContaining("core") }));
  });
});

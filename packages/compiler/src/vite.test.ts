// @vitest-environment node
import { describe, expect, test } from "vitest";
import { tinkerVite } from "./vite.ts";

describe("tinkerVite", () => {
  test("gives the compiler, the decorators and the base tag, in that order", () => {
    const preset = tinkerVite();

    expect(preset.plugins.map((plugin) => plugin.name))
      .toEqual([
        "tinker:compile-templates",
        "tinker:standard-decorators",
        "tinker:base-tag",
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

describe("the base tag", () => {
  /** The base-tag plugin of the preset, with its hooks as Vite calls them. */
  function baseTagHooks() {
    const plugin = tinkerVite().plugins.find(({ name }) => name === "tinker:base-tag");
    return {
      configResolved: plugin?.configResolved as unknown as (config: { base: string }) => void,
      transformIndexHtml: plugin?.transformIndexHtml as unknown as (html: string) => string,
    };
  }

  test("writes the resolved base into the page's <base> element", () => {
    const hooks = baseTagHooks();

    hooks.configResolved({ base: "/tinker/" });

    expect(hooks.transformIndexHtml("<html><head></head></html>"))
      .toBe("<html><head>\n    <base href=\"/tinker/\" /></head></html>");
  });

  test("writes the root base when none is set", () => {
    const hooks = baseTagHooks();

    hooks.configResolved({ base: "/" });

    expect(hooks.transformIndexHtml("<head></head>"))
      .toContain("<base href=\"/\" />");
  });

  test("leaves a page with no <head> unchanged", () => {
    const hooks = baseTagHooks();

    hooks.configResolved({ base: "/" });

    expect(hooks.transformIndexHtml("<body></body>"))
      .toBe("<body></body>");
  });
});

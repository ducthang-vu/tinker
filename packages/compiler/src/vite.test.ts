// @vitest-environment node
import type { Plugin } from "vite";
import { describe, expect, test } from "vitest";
import { tinkerConfig } from "./vite.ts";

/** The name of each plugin of a config, as Vite reads it. */
function namesOf(plugins: readonly object[]): string[] {
  return plugins.map((plugin) => (plugin as Plugin).name);
}

describe("tinkerConfig", () => {
  test("gives the compiler, the decorators and the base tag, in that order", () => {
    expect(namesOf(tinkerConfig().plugins))
      .toEqual([
        "tinker:compile-templates",
        "tinker:standard-decorators",
        "tinker:base-tag",
      ]);
  });

  test("gives the workspace aliases, one per exported subpath of each package", () => {
    const aliases = tinkerConfig().aliases;

    expect(aliases)
      .toContainEqual(expect.objectContaining({ replacement: expect.stringContaining("core") }));
  });
});

describe("the base tag", () => {
  /** The base-tag plugin of the config, with its hooks as Vite calls them. */
  function baseTagHooks() {
    const plugin = tinkerConfig().plugins.find((p) => (p as Plugin).name === "tinker:base-tag") as Plugin;
    return {
      configResolved: plugin.configResolved as unknown as (config: { base: string }) => void,
      transformIndexHtml: plugin.transformIndexHtml as unknown as (html: string) => string,
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

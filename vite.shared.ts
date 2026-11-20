// What the Vite configs of this repo share: the standard decorators step, and the
// alias that reads each workspace package (`@tinker/<name>`) from its source.

import { transformAsync } from "@babel/core";
import type { Plugin, Rolldown } from "vite";

/**
 * Vite's own compiler (Oxc) can't convert standard decorators into
 * JavaScript that runs today, so Babel does that one step first.
 * Babel keeps the TypeScript types; Vite strips them afterwards as usual.
 */
export function standardDecorators(): Plugin {
  return {
    name: "tinker:standard-decorators",
    enforce: "pre",
    async transform(code, id) {
      if (!/\.tsx?$/.test(id) || id.includes("node_modules") || !code.includes("@")) {
        return null;
      }
      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: [
          ["@babel/plugin-syntax-typescript", { isTSX: id.endsWith(".tsx") }],
          ["@babel/plugin-proposal-decorators", { version: "2023-11" }],
        ],
      });
      if (!result?.code) return null;
      // Same data; Babel just types its source map arrays as readonly.
      const map = result.map as Rolldown.ExistingRawSourceMap | null;
      return { code: result.code, map };
    },
  };
}

/** A workspace package is read from its source, not from an install. */
export const workspaceAlias = [
  // A subpath with its own entry point, from packages/core's "exports" field.
  {
    find: /^@tinker\/core\/compiler$/,
    replacement: new URL("./packages/core/src/view/compiler/index.ts", import.meta.url).pathname,
  },
  {
    find: /^@tinker\/(.+)$/,
    replacement: new URL("./packages/$1/src/index.ts", import.meta.url).pathname,
  },
];

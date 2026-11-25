// The two Vite pieces every Tinker build needs, with no import of the compile step: the
// standard decorators step, and the aliases that read each workspace package from its source.
// The repo's own Vite configs import them from here, so they load without the plugin.

import { readdirSync, readFileSync } from "node:fs";
import { transformAsync } from "@babel/core";
import type { Plugin, Rolldown } from "vite";

/**
 * Vite's own compiler (Oxc) can't convert standard decorators into JavaScript that runs
 * today, so Babel does that one step first. Babel keeps the TypeScript types; Vite strips
 * them afterwards as usual.
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

/**
 * A workspace package is read from its source, not from an install. Each entry of a package's
 * `exports` field is an alias: `@tinker/<name>` and each subpath, as the package declares them.
 */
/** The `packages/` folder: this file sits in packages/compiler/src (or dist), two levels down. */
export const workspacePackages = new URL("../../", import.meta.url);

export function workspaceAliases(
  packages: URL,
): { find: RegExp; replacement: string }[] {
  return readdirSync(packages)
    .flatMap((dir) => {
      const manifest = JSON.parse(readFileSync(new URL(`${dir}/package.json`, packages), "utf8"));
      const exports = (manifest.exports ?? {}) as Record<string, string | { development: string }>;
      return Object.entries(exports)
        .map(([key, target]) => {
          const source = typeof target === "string" ? target : target.development;
          const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
          return {
            find: new RegExp(`^${specifier.replace(/[/.]/g, "\\$&")}$`),
            replacement: new URL(`${dir}/${source}`, packages).pathname,
          };
        });
    });
}

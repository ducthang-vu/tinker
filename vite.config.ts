import { transformAsync } from "@babel/core";
import type { Plugin, Rolldown } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Vite's own compiler (Oxc) can't convert standard decorators into
 * JavaScript that runs today, so Babel does that one step first.
 * Babel keeps the TypeScript types; Vite strips them afterwards as usual.
 */
function standardDecorators(): Plugin {
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

export default defineConfig({
  plugins: [standardDecorators()],
  // A workspace package (`@tinker/<name>`) is read from its source, not from an install.
  resolve: {
    alias: [{ find: /^@tinker\/(.+)$/, replacement: new URL("./packages/$1/src/index.ts", import.meta.url).pathname }],
  },
  server: {
    open: "/examples/basics/",
  },
  test: {
    environment: "jsdom",
    // Tests live next to the files they test.
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 100,
        branches: 100,
      },
    },
  },
});

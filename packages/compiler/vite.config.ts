// Builds the plugin into one plain JavaScript file, packages/compiler/dist/index.js.
// The example's Vite config imports that file: Node loads it without TypeScript,
// which it cannot run for core's source. Core and functional are bundled in from
// their source; Babel stays external, as an installed dependency.

import { defineConfig } from "vite";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

export default defineConfig({
  // Core's source uses decorators (@cached on a computed, say), which Node cannot run.
  plugins: [standardDecorators()],
  resolve: {
    alias: workspaceAlias,
  },
  build: {
    ssr: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // index.js is the plugin; the other two files are the commands.
      input: {
        "index": "src/index.ts",
        "tinker-check": "bin/tinker-check.ts",
        "tinker-compile": "bin/tinker-compile.ts",
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
  },
});

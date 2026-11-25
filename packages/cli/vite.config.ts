// Builds the command into one plain JavaScript file, packages/cli/dist/tinker.js, which Node runs
// without TypeScript. It needs no dependency at run time: the command uses only Node's own modules.

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        tinker: "bin/tinker.ts",
        cli: "src/cli.ts",
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
  },
});

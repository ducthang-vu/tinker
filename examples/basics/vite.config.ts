// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig } from "vite";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

export default defineConfig({
  base: "./",
  plugins: [standardDecorators()],
  resolve: {
    alias: workspaceAlias,
  },
  server: {
    open: "/",
  },
  build: {
    outDir: "../../dist/example",
    emptyOutDir: true,
  },
});

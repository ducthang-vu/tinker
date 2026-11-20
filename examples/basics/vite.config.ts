// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig } from "vite";
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

export default defineConfig({
  base: "./",
  // The check reads the decorators, so it runs before the decorator transform.
  plugins: [tinkerCompiler(), standardDecorators()],
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

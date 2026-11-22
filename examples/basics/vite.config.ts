// The example app's own build and dev server. It imports @tinker/core like any app.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

export default defineConfig({
  base: "./",
  // The check reads the decorators, so it runs before the decorator transform.
  plugins: [tinkerCompiler({ emit: true }), standardDecorators()],
  resolve: {
    alias: workspaceAlias,
  },
  server: {
    open: "/",
  },
  build: {
    outDir: "../../dist/example",
    emptyOutDir: true,
    rollupOptions: {
      // Two pages: the demo, and the API reference.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        api: fileURLToPath(new URL("./api.html", import.meta.url)),
      },
    },
  },
});

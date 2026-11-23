// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig } from "vite";
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

export default defineConfig({
  root: "src",
  // The folder the app is served under, chosen when it is built: "/tinker/" for a project site on
  // GitHub Pages, "/" at a domain root, "./" when the folder does not matter (the default).
  base: process.env.TINKER_BASE ?? "./",
  // The check reads the decorators, so it runs before the decorator transform.
  plugins: [tinkerCompiler({ emit: true }), standardDecorators()],
  resolve: {
    alias: workspaceAlias,
  },
  server: {
    open: "/",
  },
  build: {
    outDir: "../../../dist/example",
    emptyOutDir: true,
  },
});

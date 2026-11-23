// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig, type Plugin } from "vite";
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators, workspaceAlias } from "../../vite.shared.ts";

// The folder the app is served under, chosen when it is built: "/tinker/" for a project site on
// GitHub Pages, "/" (the default) at a domain root.
const base = process.env.TINKER_BASE ?? "/";

/** Writes the folder into the page's <base> element, which the router reads. */
function baseTag(folder: string): Plugin {
  return {
    name: "tinker:base-tag",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <base href="${folder}" />`),
  };
}

export default defineConfig({
  root: "src",
  base,
  // The check reads the decorators, so it runs before the decorator transform.
  plugins: [tinkerCompiler({ emit: true }), standardDecorators(), baseTag(base)],
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

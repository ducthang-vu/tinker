// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig, type Plugin } from "vite";
import { tinkerVite } from "@tinker/compiler";

// The folder the app is served under, chosen when it is built: "/tinker/" for a project site on
// GitHub Pages, "/" (the default) at a domain root.
const base = process.env.TINKER_BASE ?? "/";

/**
 * Writes the folder into the page's <base> element, which the router reads. The folder is Vite's
 * own base, once resolved, so the router and the asset URLs always agree, even when the base is
 * overridden on the command line (`vite build --base=...`).
 */
function baseTag(): Plugin {
  let folder = "/";
  return {
    name: "tinker:base-tag",
    configResolved: (config) => {
      folder = config.base;
    },
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <base href="${folder}" />`),
  };
}

const preset = tinkerVite();

export default defineConfig({
  ...preset,
  root: "src",
  base,
  plugins: [...preset.plugins, baseTag()],
  server: {
    open: "/",
  },
  build: {
    outDir: "../../../dist/example",
    emptyOutDir: true,
  },
});

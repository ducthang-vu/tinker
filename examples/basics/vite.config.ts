// The example app's own build and dev server. It imports @tinker/core like any app.
import { defineConfig } from "vite";
import { tinkerVite } from "@tinker/compiler";

// The folder the app is served under, chosen when it is built: "/tinker/" for a project site on
// GitHub Pages, "/" (the default) at a domain root.
const base = process.env.TINKER_BASE ?? "/";

const preset = tinkerVite();

export default defineConfig({
  ...preset,
  root: "src",
  base,
  server: {
    open: "/",
  },
  build: {
    outDir: "../../../dist/example",
    emptyOutDir: true,
  },
});

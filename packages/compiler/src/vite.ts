// The Vite setup a Tinker app needs, as one preset: the compile step (tinkerCompiler, with
// the trees emitted), the standard decorators step, the aliases that read each workspace
// package from its source, and the <base> element the router reads for the folder the app is
// served under. An app's vite.config.ts spreads `tinkerVite()` and adds its own
// options (root, base, output).
//
// The aliases read the `packages/` folder that holds this package, so the preset works for
// an app inside this monorepo, as a workspace package. An app outside it needs the packages
// installed, and gets no aliases from here.

import type { Plugin, UserConfig } from "vite";
import { tinkerCompiler } from "./plugin.ts";
import { standardDecorators, workspaceAliases, workspacePackages } from "./workspace.ts";

/**
 * Writes the folder the app is served under into the page's <base> element, which the router
 * reads. The folder is Vite's own base, once resolved, so the router and the asset URLs always
 * agree, even when the base is set on the command line (`--base`, or Vite's `--base=...`).
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

/**
 * The Vite config of a Tinker app: the plugins and the aliases. Spread it into the app's
 * `defineConfig`, then add the app's own options. The app's own plugins go after `plugins`.
 */
export function tinkerVite(): Omit<UserConfig, "plugins"> & { plugins: Plugin[] } {
  return {
    // The check reads the decorators, so it runs before the decorator transform.
    plugins: [tinkerCompiler({ emit: true }), standardDecorators(), baseTag()],
    resolve: {
      alias: workspaceAliases(workspacePackages),
    },
  };
}

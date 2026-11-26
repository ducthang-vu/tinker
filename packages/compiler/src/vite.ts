// The Vite setup a Tinker app needs, as one preset: the compile step (tinkerCompiler, with
// the trees emitted), the standard decorators step, and the aliases that read each workspace
// package from its source. An app's vite.config.ts spreads `tinkerVite()` and adds its own
// options (root, base, output).
//
// The aliases read the `packages/` folder that holds this package, so the preset works for
// an app inside this monorepo, as a workspace package. An app outside it needs the packages
// installed, and gets no aliases from here.

import type { Plugin, UserConfig } from "vite";
import { tinkerCompiler } from "./plugin.ts";
import { standardDecorators, workspaceAliases, workspacePackages } from "./workspace.ts";

/**
 * The Vite config of a Tinker app: the plugins and the aliases. Spread it into the app's
 * `defineConfig`, then add the app's own options. The app's own plugins go after `plugins`.
 */
export function tinkerVite(): Omit<UserConfig, "plugins"> & { plugins: Plugin[] } {
  return {
    // The check reads the decorators, so it runs before the decorator transform.
    plugins: [tinkerCompiler({ emit: true }), standardDecorators()],
    resolve: {
      alias: workspaceAliases(workspacePackages),
    },
  };
}

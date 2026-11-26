// The Vite setup a Tinker app needs, as one preset: the compile step (tinkerCompiler, with
// the trees emitted), the standard decorators step, the aliases that read each workspace
// package from its source, and the <base> element the router reads for the folder the app is
// served under. An app's build settings take its plugins and aliases from `tinkerConfig()`.
//
// The aliases read the `packages/` folder that holds this package, so the preset works for
// an app inside this monorepo, as a workspace package. An app outside it needs the packages
// installed, and gets no aliases from here.

import type { Plugin } from "vite";
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

/** An alias: an import whose path matches `find` reads from `replacement` instead. */
export interface TinkerAlias {
  readonly find: RegExp;
  readonly replacement: string;
}

/** What the build of a Tinker app needs: its plugins, and the aliases of the workspace packages. */
export interface TinkerConfig {
  readonly plugins: readonly object[];
  readonly aliases: readonly TinkerAlias[];
}

/** The build settings of a Tinker app: its plugins and the aliases of its workspace packages. */
export function tinkerConfig(): TinkerConfig {
  return {
    // The check reads the decorators, so it runs before the decorator transform.
    plugins: [tinkerCompiler({ emit: true }), standardDecorators(), baseTag()],
    aliases: workspaceAliases(workspacePackages),
  };
}

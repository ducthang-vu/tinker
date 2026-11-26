// The app commands, over Vite: `tinker dev` serves the app in `root`, `tinker build` builds it
// into its `dist` folder, and `tinker preview` serves that built folder. Vite is a dependency of
// this package, not of the app, so an app never names it: its config is the Tinker preset (see
// the `tinkerConfig` of @tinker/compiler).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { build, createServer, preview } from "vite";

/** The options of the commands: the dev server's port, and the folder the app is served under. */
export interface AppOptions {
  readonly port?: number;
  readonly base?: string;
}

/** Serves the app in `root` with Vite's dev server. It keeps running until the process stops. */
export async function serveApp(
  root: string,
  options: AppOptions = {},
): Promise<void> {
  const server = await createServer({
    root,
    base: options.base,
    server: { port: options.port },
  });
  await server.listen();
  server.printUrls();
}

/** Builds the app in `root` into its `dist` folder, served under `options.base`. */
export async function buildApp(
  root: string,
  options: AppOptions = {},
): Promise<void> {
  await build({ root, base: options.base });
}

/**
 * Serves the built app in `root`'s `dist` folder, as a host would serve it. It keeps running until
 * the process stops. It needs `tinker build` first: without the folder, it refuses.
 */
export async function previewApp(
  root: string,
  options: AppOptions = {},
): Promise<void> {
  if (!existsSync(join(root, "dist"))) {
    throw new Error(`There is no dist folder in ${root}: run tinker build first`);
  }
  const server = await preview({
    root,
    base: options.base,
    preview: { port: options.port },
  });
  server.printUrls();
}

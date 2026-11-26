// The app commands, over Vite: `tinker dev` serves the app in `root`, and `tinker build` builds
// it into its `dist` folder. Vite is a dependency of this package, not of the app, so an app
// never names it: its config is the Tinker preset (see the `tinkerVite` of @tinker/compiler).

import { build, createServer } from "vite";

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

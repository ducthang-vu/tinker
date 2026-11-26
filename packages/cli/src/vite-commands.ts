// The app commands, over Vite: `tinker dev` serves the app in `root`, and `tinker build` builds
// it into its `dist` folder. Vite is a dependency of this package, not of the app, so an app
// never names it: its config is the Tinker preset (see the `tinkerVite` of @tinker/compiler).

import { build, createServer } from "vite";

/** Serves the app in `root` with Vite's dev server. It keeps running until the process stops. */
export async function serveApp(
  root: string,
  options: { readonly port?: number } = {},
): Promise<void> {
  const server = await createServer({ root, server: { port: options.port } });
  await server.listen();
  server.printUrls();
}

/** Builds the app in `root` into its `dist` folder. */
export async function buildApp(root: string): Promise<void> {
  await build({ root });
}

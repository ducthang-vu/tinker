// The Tinker template compiler's Vite plugin: checks the templates of an app's
// components at build time. Add it to the app's Vite config, listed before any
// decorator transform: the transform rewrites the decorators the check reads.

export { tinkerCompiler } from "./plugin.ts";

// Whether the code runs in a development build. The compiler plugin (tinkerCompiler) defines
// `globalThis.__TINKER_DEV__` at build time, so a production bundle can drop what depends on it.
// Without the plugin, the build is not a development one. Shared by modules that have no
// injector to ask, such as signals; the view reads it through its DEV_MODE token instead.

/**
 * Whether this is a development build: `globalThis.__TINKER_DEV__` is true.
 *
 * @returns True in a development build.
 */
export function isDevBuild(): boolean {
  return (globalThis as { __TINKER_DEV__?: boolean }).__TINKER_DEV__ === true;
}

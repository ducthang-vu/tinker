// Hot reload, development only. The compiler adds a call to `__tinkerHot` to each module that
// declares components, when Vite serves the app (never in a build). Until the in-place update
// is written, a change reloads the page: the module asks Vite to reload instead of accepting it.

/** The part of Vite's hot module API the call uses. */
export interface HotModule {
  invalidate(): void;
}

/**
 * Called by a module that declares components, when it is loaded in development.
 *
 * @param hot The module's hot API (Vite's `import.meta.hot`).
 * @param file The module's file.
 * @param fingerprint What the module's code is, without its templates: a change of only a template
 *   keeps it the same.
 * @param components The module's components, by name.
 */
export function __tinkerHot(
  hot: HotModule,
  file: string,
  fingerprint: string,
  components: readonly (readonly [string, object])[],
): void {
  void file;
  void fingerprint;
  void components;
  hot.invalidate();
}

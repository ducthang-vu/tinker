// Hot reload, development only. The compiler adds a call to `__tinkerHot` to each module that
// declares components, when Vite serves the app (never in a build). When a module changes:
//  - if only its templates changed (its code without them has the same fingerprint), the module
//    accepts the update, and each live view of its components renders its new template, keeping
//    the component's instance and state;
//  - otherwise the change reloads the page.

import { installHotHooks, type TrackedView } from "./hot-tracker.ts";

/** The part of Vite's hot module API the call uses. */
export interface HotModule {
  /** Accept the update of this module: its own code takes it from here. */
  accept(): void;
  /** Reload the page: the update cannot be applied in place. */
  invalidate(): void;
}

/** What a module's component was, the last time its module was loaded. */
interface Component {
  /** The class now declared for it. */
  type: object;
  readonly fingerprint: string;
  /** The root views of its instances, which render its template. */
  views: Set<TrackedView>;
}

/** The components, by module file and name. */
const components = new Map<string, Component>();
/** Each class a component has been, to the component it belongs to. */
const byClass = new Map<object, Component>();

installHotHooks({
  currentOf: (type) => byClass.get(type)?.type ?? type,
  track: (type, view) => {
    byClass.get(type)?.views.add(view);
  },
});

/**
 * Called by a module that declares components, when it is loaded in development.
 *
 * @param hot The module's hot API (Vite's `import.meta.hot`).
 * @param file The module's file.
 * @param fingerprint What the module's code is, without its templates.
 * @param declared The module's components, by name.
 */
export function __tinkerHot(
  hot: HotModule,
  file: string,
  fingerprint: string,
  declared: readonly (readonly [string, object])[],
): void {
  const changedCode = declared.some(([name]) => {
    const existing = components.get(`${file}#${name}`);
    return existing !== undefined && existing.fingerprint !== fingerprint;
  });
  if (changedCode) {
    hot.invalidate();
    return;
  }
  hot.accept();
  for (const [name, type] of declared) {
    const id = `${file}#${name}`;
    const existing = components.get(id);
    if (existing === undefined) {
      const created: Component = { type, fingerprint, views: new Set() };
      components.set(id, created);
      byClass.set(type, created);
      continue;
    }
    existing.type = type;
    byClass.set(type, existing);
    existing.views = new Set([...existing.views].filter((view) => !view.destroyed));
    for (const view of existing.views) {
      view.rerender(type);
    }
  }
}

// The children of lazy routes, once loaded. A route with loadChildren loads its children the first
// time a navigation reaches it, and keeps them with the route object, so every router that uses the
// route sees the same children. A load that is still running is shared by every navigation that
// reaches the route.

import type { Route } from "./route.ts";

/** The children each lazy route has loaded. */
const loaded = new WeakMap<Route, readonly Route[]>();

/** The loads still running, by lazy route. */
const loading = new WeakMap<Route, Promise<readonly Route[]>>();

/**
 * The children a lazy route has loaded, or undefined when they are not loaded yet.
 *
 * @param route The route with loadChildren.
 * @returns The loaded children, or undefined.
 */
export function loadedChildrenOf(route: Route): readonly Route[] | undefined {
  return loaded.get(route);
}

/**
 * Loads the children of `route` with its loader, unless a load is running already. A failed load is
 * not kept, so a later navigation tries it again.
 *
 * @param route The route with loadChildren.
 * @param loader The route's loadChildren.
 * @returns The loaded children.
 */
export function loadChildrenOnce(
  route: Route,
  loader: () => Promise<readonly Route[]>,
): Promise<readonly Route[]> {
  const pending = loading.get(route);
  if (pending !== undefined) {
    return pending;
  }
  // The promise starts the loader, so a loader that throws becomes a rejection, not a throw here.
  const started = new Promise<readonly Route[]>((resolve) => resolve(loader()))
    .then(
      (children) => {
        loaded.set(route, children);
        loading.delete(route);
        return children;
      },
      (cause: unknown) => {
        loading.delete(route);
        throw cause;
      },
    );
  loading.set(route, started);
  return started;
}

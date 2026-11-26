// The children of lazy routes, once loaded. A route with loadChildren loads its children the first
// time a navigation reaches it, and keeps them with the route object, so every router that uses the
// route sees the same children. A load that is running is shared by the navigations that wait for
// it. Each navigation holds the load while it waits; when the last one lets go before the load is
// done, the load is aborted, so no download is finished for nothing.

import type { Route } from "./route.ts";

/** The loader of a route. It receives a signal, aborted when no navigation waits any more. */
export type ChildrenLoader = (signal: AbortSignal) => Promise<readonly Route[]>;

/** The children each lazy route has loaded. */
const loaded = new WeakMap<Route, readonly Route[]>();

/** A load that is running: the promise of its children, its abort controller, and its holders. */
interface Loading {
  readonly promise: Promise<readonly Route[]>;
  readonly controller: AbortController;
  holders: number;
}

/** The loads running, by lazy route. */
const loading = new WeakMap<Route, Loading>();

/** A navigation's hold on a load: its promise, and the release that gives the hold up. */
export interface LoadHold {
  /** The loaded children, or the failure of the load. */
  readonly promise: Promise<readonly Route[]>;
  /** Gives the hold up. When no navigation holds the load any more, it is aborted. */
  release(): void;
}

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
 * Records the children of a route as already loaded. The router uses it for its own root, whose
 * routes it was given, so the root needs no loader.
 *
 * @param route The route the children belong to.
 * @param children The routes under it.
 */
export function seedChildren(route: Route, children: readonly Route[]): void {
  loaded.set(route, children);
}

/**
 * Holds the load of the children of `route`, starting it with `loader` unless a load is running.
 *
 * @param route The route with loadChildren.
 * @param loader The route's loadChildren.
 * @returns The hold: its promise, and the release that gives it up.
 */
export function loadChildrenOnce(route: Route, loader: ChildrenLoader): LoadHold {
  const running = loading.get(route) ?? startLoad(route, loader);
  running.holders += 1;
  let held = true;
  return {
    promise: running.promise,
    release: () => {
      if (!held) {
        return;
      }
      held = false;
      running.holders -= 1;
      if (running.holders === 0 && loading.get(route) === running) {
        loading.delete(route);
        running.controller.abort();
      }
    },
  };
}

/**
 * Starts the load of `route`'s children, and keeps it while it runs. A load that fails, or is
 * aborted, is not kept, so a later navigation tries it again.
 *
 * @param route The route with loadChildren.
 * @param loader The route's loadChildren.
 * @returns The load that is now running.
 */
function startLoad(route: Route, loader: ChildrenLoader): Loading {
  const controller = new AbortController();
  const running: Loading = {
    controller,
    holders: 0,
    promise: new Promise<readonly Route[]>((resolve) => resolve(loader(controller.signal)))
      .then(
        (children) => {
          loaded.set(route, children);
          forget(route, running);
          return children;
        },
        (cause: unknown) => {
          forget(route, running);
          throw cause;
        },
      ),
  };
  loading.set(route, running);
  return running;
}

/**
 * Forgets a load that has ended, unless a newer load of the same route has replaced it.
 *
 * @param route The route the load was for.
 * @param running The load that ended.
 */
function forget(route: Route, running: Loading): void {
  if (loading.get(route) === running) {
    loading.delete(route);
  }
}

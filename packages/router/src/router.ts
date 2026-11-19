// The router: the current URL as a signal, the route that matches it, and `navigate`. It reads
// and writes the URL through Location, so it follows the browser's back and forward moves too.

import { computed, Either, type ReadonlySignal } from "@tinker/core";
import type { Location } from "./location.ts";
import { matchRoute, type RouteMatch } from "./match.ts";
import type { Route } from "./route.ts";

/** A navigation to a URL that no route matches. The URL does not change. */
export class NoRouteError extends Error {
  constructor(readonly url: string) {
    super(`Cannot match any route: ${url}`);
    this.name = "NoRouteError";
  }
}

export class Router {
  /** The current URL: path, query and hash. */
  readonly url: ReadonlySignal<string>;
  /** The route that matches the current URL and its params, or undefined when none does. */
  readonly match: ReadonlySignal<RouteMatch | undefined>;
  private readonly root: Route;
  private readonly location: Location;

  constructor(root: Route, location: Location) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.match = computed(() => matchRoute(root, location.url()));
  }

  /**
   * Go to `url` as a new history entry, with `state`. A URL no route matches is rejected with a
   * `NoRouteError`, and nothing changes; declare a `**` route to catch those URLs.
   */
  navigate(url: string, state: unknown = null): Either<NoRouteError, void> {
    if (matchRoute(this.root, url) === undefined) {
      return Either.left(new NoRouteError(url));
    }
    this.location.go(url, state);
    return Either.right(undefined);
  }
}

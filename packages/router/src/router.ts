// The router: the current URL as a signal, the route that matches it, and `navigate`. It reads
// and writes the URL through Location, so it follows the browser's back and forward moves too.

import { computed, type ReadonlySignal } from "@tinker/core";
import type { Location } from "./location.ts";
import { matchRoute, type RouteMatch } from "./match.ts";
import type { Route } from "./route.ts";

export class Router {
  /** The current URL: path, query and hash. */
  readonly url: ReadonlySignal<string>;
  /** The route that matches the current URL and its params, or undefined when none does. */
  readonly match: ReadonlySignal<RouteMatch | undefined>;
  private readonly location: Location;

  constructor(routes: readonly Route[], location: Location) {
    this.location = location;
    this.url = location.url;
    this.match = computed(() => matchRoute(routes, location.url()));
  }

  /** Go to `url` as a new history entry, with `state`. A URL no route matches still changes it. */
  navigate(url: string, state: unknown = null): void {
    this.location.go(url, state);
  }
}

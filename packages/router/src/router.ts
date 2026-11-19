// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.

import { computed, Either, type ReadonlySignal } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import type { Location } from "./location.ts";
import { matchChain, matchRoute, type RouteMatch } from "./match.ts";
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
  /** The activated routes for the current URL, root first. The first one never changes. */
  readonly activated: ReadonlySignal<readonly ActivatedRoute[]>;
  private readonly root: Route;
  private readonly location: Location;
  private readonly rootRoute: ActivatedRoute;

  constructor(root: Route, location: Location) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.rootRoute = new ActivatedRoute(root, {}, []);
    this.match = computed(() => matchRoute(root, location.url()));
    this.activated = computed(() => {
      const chain = matchChain(root, location.url());
      if (chain === undefined) {
        return [this.rootRoute];
      }
      return [
        this.rootRoute,
        ...chain.slice(1)
          .map((level) => new ActivatedRoute(level.route, level.params, level.segments)),
      ];
    });
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

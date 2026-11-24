// A route: a path, and the component it shows. The app gives its top-level routes to the router
// (provideRouter); a route's children match the segments its path leaves over, and the router
// matches a URL against the tree, from a root that is never shown.

import type { Class } from "@tinker/core";
import type { MatchedRequest } from "../pipeline/request.ts";

export interface Route {
  /**
   * The path the route consumes, e.g. `"/todos"`. A segment that starts with `:` is a param, so
   * `"/todos/:id"` matches `"/todos/7"` with `id` set to `"7"`. The path `"**"` matches any URL,
   * for a page shown when nothing else matches; declare it last among the children.
   */
  readonly path: string;
  /** The component shown when the route matches. Every route needs one. */
  readonly component?: Class<object>;
  /** Static data of the route, read from the `ActivatedRoute` of the component it shows. */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * The routes under this one, matched against the segments its path leaves over, in order; the
   * first that matches wins. A route without children must match the whole URL.
   */
  readonly children?: readonly Route[];
  /**
   * Sends a navigation that matches this route to another URL. It is given the matched request,
   * and returns the URL to go to instead, or `undefined` to leave the navigation alone. It is
   * asked before any guard runs, and it runs in the injection context of the router, so it can
   * `inject`.
   */
  readonly redirect?: (request: MatchedRequest) => string | undefined;
}

/** The component a route shows. Throws for a route with none: every route shows one. */
export function componentOf(route: Route): Class<object> {
  if (route.component === undefined) {
    throw new Error(`The route "${route.path}" needs a component: every route shows one`);
  }
  return route.component;
}

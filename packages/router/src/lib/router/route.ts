// A route: a path, and the component it shows. The app gives its top-level routes to the router
// (provideRouter); a route's children match the segments its path leaves over, and the router
// matches a URL against the tree, from a root that is never shown.

import type { Class } from "@tinker/core";
import type { DeactivateGuard, Guard, RouteGate } from "../pipeline/guard-step.ts";
import type { AppPath } from "../destination/app-path.ts";
import type { MatchedRequest } from "../pipeline/request.ts";

/** A route: a path and the component it shows, with its children, guards and redirect. */
export interface Route {
  /**
   * The one segment the route consumes, e.g. `"todos"`. A segment that starts with `:` is a param,
   * so `":id"` matches `"7"` with `id` set to `"7"`. A longer URL is nested: `"todos"` with a
   * child `":id"` matches `"/todos/7"`. The path `""` consumes no segment, for the page of its
   * parent. The path `"**"` matches the rest of any URL, for a page shown when nothing else
   * matches; declare it last among the children.
   */
  readonly path: string;
  /**
   * The component shown when the route matches. A route without one shows nothing of its own: the
   * outlet shows the first route below it that has a component, so a group of routes can share
   * a parent with no page of its own.
   */
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
  readonly redirect?: (request: MatchedRequest) => AppPath | undefined;
  /**
   * Guards that run when the navigation leaves this route, before any activate guard. They run
   * from the last route left to the first, in sequence, in the injection context of the router.
   */
  readonly canDeactivate?: readonly DeactivateGuard[];
  /**
   * Guards that decide whether the navigation may go on, run after the deactivate guards. Each
   * returns a Task of a command: ALLOW, STOP, or REDIRECT. They run root first, in sequence, in the
   * injection context of the router.
   */
  readonly canActivate?: readonly Guard[];
  /**
   * Asked for each navigation that reaches the route, before its children are looked at. ALLOW
   * keeps the route; STOP skips it, so the next route with a matching path is tried; REDIRECT sends
   * the navigation elsewhere. They run in order, in the injection context of the router.
   */
  readonly canMatch?: readonly RouteGate[];
  /**
   * The children of the route, loaded the first time a navigation reaches it. The loader receives a
   * signal that is aborted when every navigation waiting for the load has been superseded, so the
   * download can stop. A route that has `children` does not use this. Once loaded, the children are
   * kept, so the route loads once.
   */
  readonly loadChildren?: (signal: AbortSignal) => Promise<readonly Route[]>;
}

/**
 * The component a route shows. Throws for a route with none: the outlet only asks for the routes
 * that have one.
 * @param route
 * @param route The route.
 * @returns The component the route shows.
 * @throws Error when the route has no component.
 */
export function componentOf(route: Route): Class<object> {
  if (route.component === undefined) {
    throw new Error(`The route "${route.path}" needs a component: every route shows one`);
  }
  return route.component;
}

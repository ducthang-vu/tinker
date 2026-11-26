// A route: a path, and what it does with the URL: redirect, show a component, or group routes.
// The app gives its top-level routes to the router (provideRouter); a route's children match the
// segments its path leaves over, and the router matches a URL against the tree, from a root that
// is never shown.

import type { Class } from "@tinker/core";
import type { DeactivateGuard, Guard, RouteGate } from "../pipeline/guard-step.ts";
import type { AppPath } from "../destination/app-path.ts";
import type { MatchedRequest } from "../pipeline/request.ts";

/** A route: a path, and what it does with the URL. Redirect, page and group are its three kinds. */
export type Route = RedirectRoute | PageRoute | GroupRoute;

/** What every kind of route has. */
interface RouteCommon {
  /**
   * The one segment the route consumes, e.g. `"todos"`. A segment that starts with `:` is a param,
   * so `":id"` matches `"7"` with `id` set to `"7"`. A longer URL is nested: `"todos"` with a
   * child `":id"` matches `"/todos/7"`. The path `""` consumes no segment, for the page of its
   * parent. The path `"**"` matches the rest of any URL, for a page shown when nothing else
   * matches; declare it last among the children.
   */
  readonly path: string;
  /**
   * Asked for each navigation that reaches the route, before its children are looked at. ALLOW
   * keeps the route; STOP skips it, so the next route with a matching path is tried; REDIRECT sends
   * the navigation elsewhere. They run in order, in the injection context of the router.
   */
  readonly canMatch?: readonly RouteGate[];
}

/** The loader of the routes under a route. It runs the first time a navigation reaches it. */
type Nesting = { readonly loadChildren: (signal: AbortSignal) => Promise<readonly Route[]> };

/** Guards and static data: what a route that shows something, or groups children, has. */
interface RouteGuards {
  /** Static data of the route, read from the `ActivatedRoute` of the component it shows. */
  readonly data?: Readonly<Record<string, unknown>>;
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
}

/**
 * A route that sends the navigation elsewhere. It shows nothing and nests nothing, so it has no
 * component, children, guards or data. To redirect after the guards, use a `canActivate` guard
 * that returns REDIRECT on a page route instead.
 */
export interface RedirectRoute extends RouteCommon {
  /**
   * Sends a navigation that matches this route to another URL. It is given the matched request,
   * and returns the URL to go to instead, or `undefined` to leave the navigation alone. It runs in
   * the injection context of the router, so it can `inject`.
   */
  readonly redirect: (request: MatchedRequest) => AppPath | undefined;
  /** A redirect route shows nothing, so it has no component. */
  readonly component?: never;
  /** A redirect route nests nothing, so it has no loader for children. */
  readonly loadChildren?: never;
  /** A redirect route has no data: it shows no component to read it. */
  readonly data?: never;
  /** A redirect route has no activate guard: the guards of the chain do not run before it. */
  readonly canActivate?: never;
  /** A redirect route has no deactivate guard: it is never left as a page. */
  readonly canDeactivate?: never;
}

/** A route that shows a component. It may nest routes below it, for its own page to show. */
export interface PageRoute extends RouteCommon, RouteGuards {
  /** The component shown when the route matches. */
  readonly component: Class<object>;
  /** A page route shows its component, so it does not redirect. */
  readonly redirect?: never;
  /** Loads the routes under the page the first time a navigation reaches it. */
  readonly loadChildren?: (signal: AbortSignal) => Promise<readonly Route[]>;
}

/**
 * A route that shows no component of its own, and groups routes under it. The outlet shows the
 * first route below it that has a component, so the group can share a parent with no page.
 */
export type GroupRoute = RouteCommon & RouteGuards & Nesting & {
  /** A group shows no component of its own. */
  readonly component?: never;
  /** A group does not redirect. */
  readonly redirect?: never;
};

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
    throw new Error(`The route "${route.path}" has no component`);
  }
  return route.component;
}

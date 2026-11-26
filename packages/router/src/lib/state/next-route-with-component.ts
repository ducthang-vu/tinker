// NextRouteWithComponent: the activated route an outlet shows, as a signal of a Maybe: None when
// it shows nothing. It is the first route below the outlet's owner that has a component, so a
// route without one is passed through. Whoever owns the outlet provides it, so the outlet only
// reads it.

import { InjectionToken, type ReadonlySignal } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import { Some, None, fromNullable, type Maybe } from "@tinker/functional";

export const NextRouteWithComponent = new InjectionToken<ReadonlySignal<Maybe<ActivatedRoute>>>(
  "NextRouteWithComponent",
);

/**
 * The first route after `route` in `list` that has a component, so a route without one is passed
 * through to the routes below it. None when there is none.
 * @param list The activated routes, root first.
 * @param route The route to look after.
 * @returns The first route after `route` with a component, or None when there is none.
 */
export function shownAfter(
  list: readonly ActivatedRoute[],
  route: ActivatedRoute,
): Maybe<ActivatedRoute> {
  const index = list.indexOf(route);
  return index === -1
    ? None.of()
    : fromNullable(list.slice(index + 1)
        .find((item) => item.route.component !== undefined));
}

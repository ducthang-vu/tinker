// ChildActivatedRoute: the activated route an outlet shows, as a signal of a Maybe: None when it
// shows nothing. Whoever owns the outlet provides it, so the outlet only reads it.

import { InjectionToken, Maybe, type ReadonlySignal } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";

export const ChildActivatedRoute = new InjectionToken<ReadonlySignal<Maybe<ActivatedRoute>>>(
  "ChildActivatedRoute",
);

/** The route after `route` in `list`: Some, or None when it is not there, or is the last. */
export function nextAfter(
  list: readonly ActivatedRoute[],
  route: ActivatedRoute,
): Maybe<ActivatedRoute> {
  const index = list.indexOf(route);
  return index === -1 ? Maybe.none() : Maybe.from(list[index + 1]);
}

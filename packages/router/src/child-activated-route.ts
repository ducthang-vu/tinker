// ChildActivatedRoute: the activated route an outlet shows, as a signal of a Maybe: None when it
// shows nothing. Whoever owns the outlet provides it, so the outlet only reads it.

import { InjectionToken, type ReadonlySignal } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import { Some, None, fromNullable, type Maybe } from "@tinker/functional/v1";

export const ChildActivatedRoute = new InjectionToken<ReadonlySignal<Maybe<ActivatedRoute>>>(
  "ChildActivatedRoute",
);

/** The route after `route` in `list`: Some, or None when it is not there, or is the last. */
export function nextAfter(
  list: readonly ActivatedRoute[],
  route: ActivatedRoute,
): Maybe<ActivatedRoute> {
  const index = list.indexOf(route);
  return index === -1 ? None.of() : fromNullable(list[index + 1]);
}

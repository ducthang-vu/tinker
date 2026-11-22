// ActivatedRoute: one level of the route tree as the router matched it, for the current URL: the
// route, the params it read, the URL segments it consumed, and the level above it. The router keeps
// a list of them, root first. The first one is the root and is never replaced; the others are made
// per navigation.

import { } from "@tinker/core";
import type { RouteParams } from "../router/match.ts";
import type { Route } from "../router/route.ts";
import { Some, None, match, type Maybe } from "@tinker/functional";

export class ActivatedRoute {
  /** The path of this level: the segments of every level from the root down to it. */
  get path(): readonly string[] {
    const above = match(this.parent, { Some: (parent) => parent.path, None: () => [] });
    return [...above, ...this.segments];
  }

  constructor(
    /** The route of this level. */
    readonly route: Route,
    /** The params this level read from its segments. */
    readonly params: RouteParams,
    /** The URL segments this level consumed. */
    readonly segments: readonly string[],
    /** The level above this one, or None for the root. */
    readonly parent: Maybe<ActivatedRoute>,
  ) {}
}

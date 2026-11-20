// ActivatedRoute: one level of the route tree as the router matched it, for the current URL: the
// route, the params it read, the URL segments it consumed, and the level above it. The router keeps
// a list of them, root first. The first one is the root and is never replaced; the others are made
// per navigation.

import { Maybe } from "@tinker/core";
import type { RouteParams } from "./match.ts";
import type { Route } from "./route.ts";

/** The values a route's resolvers produced, by name. */
export type ResolvedData = Readonly<Record<string, unknown>>;

export class ActivatedRoute {
  /** The static data of the route, with the values its resolvers produced over it. */
  get data(): ResolvedData {
    return { ...this.route.data, ...this.resolved };
  }

  /** The path of this level: the segments of every level from the root down to it. */
  get path(): readonly string[] {
    const above = this.parent.match({
      some: (parent) => parent.path,
      none: () => [],
    });
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
    /** The values the route's resolvers produced for this level. */
    readonly resolved: ResolvedData = {},
  ) {}
}

// Matches a URL against the route tree, from its root. A route consumes the segments of its path:
// a `:name` segment takes any one segment, and "**" takes all the rest and matches any URL. A route
// with children gives the segments it did not consume to them, and the first child that matches
// wins. A route without children must consume every segment. The query and the hash are not part
// of the path, and empty segments are ignored, so "/todos/" is "/todos".

import type { Route } from "./route.ts";
import { UrlBuilder } from "./url-builder.ts";

/** The params a path read, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** One level of a match: a route of the tree, the params it read, and the segments it consumed. */
export interface LevelMatch {
  readonly route: Route;
  readonly params: RouteParams;
  readonly segments: readonly string[];
}

/** The leaf route that matches the URL, with the params read along the whole path. */
export interface RouteMatch {
  readonly route: Route;
  readonly params: RouteParams;
}

/** The levels from the root down to the leaf that match `url`, or undefined when none does. */
export function matchChain(root: Route, url: string): readonly LevelMatch[] | undefined {
  return levelsFrom(root, UrlBuilder.from(url).segments);
}

/** The leaf that matches `url`, with the params of every level, or undefined when none does. */
export function matchRoute(root: Route, url: string): RouteMatch | undefined {
  const chain = matchChain(root, url);
  return chain === undefined ? undefined : matchOf(chain);
}

/** The leaf of a chain of levels, with the params read along it. */
export function matchOf(chain: readonly LevelMatch[]): RouteMatch {
  return {
    route: chain[chain.length - 1]?.route as Route,
    params: Object.fromEntries(chain.flatMap((level) => Object.entries(level.params))),
  };
}

/** The levels of `route` and its descendants that match `segments`, or undefined when none do. */
function levelsFrom(route: Route, segments: readonly string[]): readonly LevelMatch[] | undefined {
  if (route.path === "**") {
    return [{ route, params: {}, segments }];
  }
  const consumed = consume(route.path, segments);
  if (consumed === undefined) {
    return undefined;
  }
  const rest = segments.slice(consumed.count);
  const own: LevelMatch = {
    route,
    params: consumed.params,
    segments: segments.slice(0, consumed.count),
  };
  if (route.children === undefined) {
    return rest.length === 0 ? [own] : undefined;
  }
  for (const child of route.children) {
    const below = levelsFrom(child, rest);
    if (below !== undefined) {
      return [own, ...below];
    }
  }
  return undefined;
}

/** The params of `pattern` for the leading segments, and how many segments it takes. */
function consume(
  pattern: string,
  segments: readonly string[],
): { params: RouteParams; count: number } | undefined {
  const parts = UrlBuilder.from(pattern).segments;
  if (parts.length > segments.length) {
    return undefined;
  }
  const pairs = parts.map((part, index) => [part, segments[index] as string] as const);
  if (!pairs.every(([part, segment]) => part.startsWith(":") || part === segment)) {
    return undefined;
  }
  return {
    params: Object.fromEntries(
      pairs
        .filter(([part]) => part.startsWith(":"))
        .map(([part, segment]) => [part.slice(1), segment]),
    ),
    count: parts.length,
  };
}

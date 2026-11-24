// Matches a URL against the route tree, from its root. A route consumes one segment of the URL: a
// `:name` segment takes any one segment, `""` takes none, and "**" takes all the rest and matches
// any URL. A route with children gives the segments it did not consume to them, and the first child
// that matches wins. A route without children must consume every segment. The query and the hash
// are not part of the path, and empty segments are ignored, so "/todos/" is "/todos". This is the
// one matcher: the pipeline and the builder's `parse` use it too.

import type { Route } from "./route.ts";

/** The params a path read, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** One level of a match: a route of the tree, the params it read, and the segments it consumed. */
export interface LevelMatch {
  /** The route of the level. */
  readonly route: Route;
  /** The params the level read from its segments. */
  readonly params: RouteParams;
  /** The URL segments the level consumed. */
  readonly segments: readonly string[];
}

/** The leaf route that matches the URL, with the params read along the whole path. */
export interface RouteMatch {
  /** The leaf route the URL matches. */
  readonly route: Route;
  /** The params read along the whole path. */
  readonly params: RouteParams;
}

/**
 * The levels from the root down to the leaf that match `url`, or undefined when none does.
 * @param root
 * @param url
 * @returns The levels, root first, or undefined when no route matches.
 */
export function matchChain(root: Route, url: string): readonly LevelMatch[] | undefined {
  return levelsOf(root, segmentsOf(url));
}

/**
 * The leaf that matches `url`, with the params of every level, or undefined when none does.
 * @param root
 * @param url
 * @returns The leaf route and its params, or undefined when no route matches.
 */
export function matchRoute(root: Route, url: string): RouteMatch | undefined {
  const chain = matchChain(root, url);
  if (chain === undefined) {
    return undefined;
  }
  return {
    route: chain[chain.length - 1]?.route as Route,
    params: Object.fromEntries(chain.flatMap((level) => Object.entries(level.params))),
  };
}

/** A route as the matcher sees it: its path, and the children it nests. */
export interface PathNode<N> {
  /** The path the node consumes: one segment, a `:param`, `""` for none, or `**` for the rest. */
  readonly path: string;
  /** The nodes nested under this one. */
  readonly children?: readonly N[];
}

/** One level of a segment match: the node, the params it read, and the segments it consumed. */
export interface SegmentLevel<N> {
  /** The node of the level. */
  readonly route: N;
  /** The params the level read from its segments. */
  readonly params: RouteParams;
  /** The segments the level consumed. */
  readonly segments: readonly string[];
}

/**
 * The levels from `root` down that match `segments`, root first, or undefined when none does. The
 * router's one matcher: the URL matching, the pipeline and the builder's `parse` all use it.
 *
 * @param root The node the match starts at.
 * @param segments The segments to match, in order.
 * @returns The levels, root first, or undefined when no route matches.
 */
export function levelsOf<N extends PathNode<N>>(
  root: N,
  segments: readonly string[],
): readonly SegmentLevel<N>[] | undefined {
  return levelsFrom(root, segments);
}

/**
 * The non-empty segments of a URL's path: the query and the hash are left out.
 *
 * @param url The URL or path.
 * @returns The segments, in order.
 */
function segmentsOf(url: string): readonly string[] {
  return url.replace(/[?#].*$/, "")
    .split("/")
    .filter((segment) => segment !== "");
}

/**
 * The levels of `route` and its descendants that match `segments`, or undefined when none do.
 * @param route
 * @param segments
 * @returns The levels that match, or undefined when none do.
 */
function levelsFrom<N extends PathNode<N>>(
  route: N,
  segments: readonly string[],
): readonly SegmentLevel<N>[] | undefined {
  if (route.path === "**") {
    return [{ route, params: {}, segments }];
  }
  const consumed = consume(route.path, segments);
  if (consumed === undefined) {
    return undefined;
  }
  const rest = segments.slice(consumed.count);
  const own: SegmentLevel<N> = {
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

/**
 * The params of `pattern` for the leading segments, and how many segments it takes.
 * @param pattern
 * @param segments
  * @returns The params of the pattern, or undefined when it does not match.
 */
function consume(
  pattern: string,
  segments: readonly string[],
): { params: RouteParams; count: number } | undefined {
  const parts = segmentsOf(pattern);
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

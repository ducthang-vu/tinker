// Matches a URL against the route tree, from its root. A route consumes one segment of the URL: a
// `:name` segment takes any one segment, `""` takes none, and "**" takes all the rest and matches
// any URL. A route with children gives the segments it did not consume to them, and the first child
// that matches wins. A route without children must consume every segment. The query and the hash
// are not part of the path, and empty segments are ignored, so "/todos/" is "/todos". This is the
// one matcher: the pipeline and the builder's `parse` use it too.

import { loadedChildrenOf } from "./lazy-children.ts";
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
  /**
   * The segments under a lazy route whose children are not loaded yet. They are not checked here:
   * the navigation that loads the children checks them.
   */
  readonly unchecked?: readonly string[];
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
 * The leaf of a chain of levels, with the params of every level.
 *
 * @param chain The levels, root first, or undefined when no route matches.
 * @returns The leaf route and its params, or undefined when there is no chain.
 */
export function matchOfChain(chain: readonly LevelMatch[] | undefined): RouteMatch | undefined {
  if (chain === undefined) {
    return undefined;
  }
  return {
    route: (chain[chain.length - 1] as LevelMatch).route,
    params: Object.fromEntries(chain.flatMap((level) => Object.entries(level.params))),
  };
}

/**
 * The levels from `root` down that match `segments`, root first, or undefined when none does. The
 * router's one matcher: the URL matching, the builder's checks and `parse` all use it.
 *
 * @param root The node the match starts at.
 * @param segments The segments to match, in order.
 * @returns The levels, root first, or undefined when no route matches.
 */
export function levelsOf(
  root: Route,
  segments: readonly string[],
): readonly LevelMatch[] | undefined {
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
function levelsFrom(
  route: Route,
  segments: readonly string[],
): readonly LevelMatch[] | undefined {
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
  const children = route.children ?? loadedChildrenOf(route);
  if (children === undefined) {
    if (route.loadChildren !== undefined) {
      return [{ ...own, unchecked: rest }];
    }
    return rest.length === 0 ? [own] : undefined;
  }
  for (const child of children) {
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
export function consume(
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

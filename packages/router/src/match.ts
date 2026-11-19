// Matches a URL against the route tree, from its root. A route consumes the segments of its path:
// a `:name` segment takes any one segment, and "**" takes all the rest and matches any URL. A route
// with children gives the segments it did not consume to them, and the first child that matches
// wins. A route without children must consume every segment. The query and the hash are not part
// of the path, and empty segments are ignored, so "/todos/" is "/todos".

import type { Route } from "./route.ts";

/** The params a path read, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** The route that matches the URL, and the params read along the way from the root. */
export interface RouteMatch {
  readonly route: Route;
  readonly params: RouteParams;
}

/** The route of the tree under `root` that matches `url`, or undefined when none does. */
export function matchRoute(root: Route, url: string): RouteMatch | undefined {
  return matchFrom(root, segmentsOf(url.replace(/[?#].*$/, "")), {});
}

/** The match of `route` for `segments`, with the params `inherited` from the routes above it. */
function matchFrom(
  route: Route,
  segments: readonly string[],
  inherited: RouteParams,
): RouteMatch | undefined {
  if (route.path === "**") {
    return { route, params: inherited };
  }
  const consumed = consume(route.path, segments);
  if (consumed === undefined) {
    return undefined;
  }
  const params = { ...inherited, ...consumed.params };
  const rest = segments.slice(consumed.count);
  if (route.children === undefined) {
    return rest.length === 0 ? { route, params } : undefined;
  }
  for (const child of route.children) {
    const match = matchFrom(child, rest, params);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

/** The params of `pattern` for the leading segments, and how many segments it takes. */
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

/** The non-empty segments of a path: "/todos/7" is ["todos", "7"]. */
function segmentsOf(path: string): string[] {
  return path.split("/")
    .filter((segment) => segment !== "");
}

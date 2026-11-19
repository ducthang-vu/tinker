// Matches a URL against the route table. A route matches when every segment of its path is
// either the same as the URL's segment, or a param (`:name`) that takes it. The path "**" matches
// any URL, so it is a catch-all, to be declared last. The query and the hash are not part of the
// path, and empty segments are ignored, so "/todos/" is "/todos".

import type { Route } from "./route.ts";

/** The params a path read, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** A route that matches the URL, and the params it read from the path. */
export interface RouteMatch {
  readonly route: Route;
  readonly params: RouteParams;
}

/** The first route of `routes` that matches `url`, or undefined when none does. */
export function matchRoute(routes: readonly Route[], url: string): RouteMatch | undefined {
  const segments = segmentsOf(url.replace(/[?#].*$/, ""));
  for (const route of routes) {
    const params = paramsOf(route.path, segments);
    if (params !== undefined) {
      return { route, params };
    }
  }
  return undefined;
}

/** The params of `pattern` for the URL's `segments`, or undefined when it does not match. */
function paramsOf(pattern: string, segments: readonly string[]): RouteParams | undefined {
  if (pattern === "**") {
    return {};
  }
  const parts = segmentsOf(pattern);
  if (parts.length !== segments.length) {
    return undefined;
  }
  const pairs = parts.map((part, index) => [part, segments[index] as string] as const);
  if (!pairs.every(([part, segment]) => part.startsWith(":") || part === segment)) {
    return undefined;
  }
  return Object.fromEntries(
    pairs
      .filter(([part]) => part.startsWith(":"))
      .map(([part, segment]) => [part.slice(1), segment]),
  );
}

/** The non-empty segments of a path: "/todos/7" is ["todos", "7"]. */
function segmentsOf(path: string): string[] {
  return path.split("/")
    .filter((segment) => segment !== "");
}

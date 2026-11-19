// Resolving a URL against a base: a URL that starts with "/" is absolute, and any other is relative
// to the base path. "." stays where it is, ".." goes up one segment (never above the root), and any
// other segment goes down. The query and the hash are kept as they are.

import type { ActivatedRoute } from "./activated-route.ts";

/** The path of an activated route: the segments of every level from the root down to it. */
export function pathOf(route: ActivatedRoute): readonly string[] {
  const above = route.parent.match({
    some: (parent) => pathOf(parent),
    none: () => [],
  });
  return [...above, ...route.segments];
}

/** The absolute URL that `url` means, relative to the path `base`. */
export function resolveUrl(url: string, base: readonly string[]): string {
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  const suffix = cut === -1 ? "" : url.slice(cut);
  const start = path.startsWith("/") ? [] : base;
  const segments = path.split("/")
    .reduce(step, start);
  return `/${segments.join("/")}${suffix}`;
}

/** The base after one part of a relative URL. */
function step(segments: readonly string[], part: string): readonly string[] {
  if (part === "" || part === ".") {
    return segments;
  }
  if (part === "..") {
    return segments.slice(0, -1);
  }
  return [...segments, part];
}

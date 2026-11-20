// The activated routes of a navigation. A level that is still the same as before keeps its instance
// (and the values its resolvers gave it); a level that changed is made again, and so is every level
// under it, since its component sits inside the view of the one above.

import { Maybe } from "@tinker/core";
import { ActivatedRoute, type ResolvedData } from "./activated-route.ts";
import type { LevelMatch, RouteParams } from "./match.ts";

/**
 * The leading levels of `levels` (the chain below the root) whose instances in `activated` are
 * still the same level, in order. The root is `activated[0]` and is never among them.
 */
export function keptLevels(
  activated: readonly ActivatedRoute[],
  levels: readonly LevelMatch[],
): readonly ActivatedRoute[] {
  const kept: ActivatedRoute[] = [];
  for (const [index, level] of levels.entries()) {
    const candidate = activated[index + 1];
    if (candidate === undefined || !sameLevel(candidate, level)) {
      break;
    }
    kept.push(candidate);
  }
  return kept;
}

/**
 * The activated routes for a navigation, root first: `rootRoute`, then one per level of `levels`.
 * A level in `kept` keeps its instance. Any other level is made with its resolved values,
 * `resolved[i]` for the i-th of `levels`.
 */
export function activatedFor(
  rootRoute: ActivatedRoute,
  kept: readonly ActivatedRoute[],
  levels: readonly LevelMatch[],
  resolved: readonly ResolvedData[],
): readonly ActivatedRoute[] {
  return levels.reduce<readonly ActivatedRoute[]>(
    (made, level, index) => [
      ...made,
      kept[index] ?? new ActivatedRoute(
        level.route,
        level.params,
        level.segments,
        lastOf(made),
        resolved[index],
      ),
    ],
    [rootRoute],
  );
}

/** The last activated route of a non-empty list, which is the parent of the next level. */
function lastOf(made: readonly ActivatedRoute[]): Maybe<ActivatedRoute> {
  return Maybe.from(made[made.length - 1]);
}

/** Whether an activated route is still the level it was made for. */
function sameLevel(activated: ActivatedRoute, level: LevelMatch): boolean {
  return activated.route === level.route
    && sameParams(activated.params, level.params)
    && sameSegments(activated.segments, level.segments);
}

function sameParams(a: RouteParams, b: RouteParams): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

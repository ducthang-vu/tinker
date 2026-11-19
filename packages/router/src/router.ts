// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.

import {
  computed,
  Either,
  Maybe,
  type ReadonlySignal,
  type Runnable,
  signal,
  untracked,
  watch,
} from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import type { Location } from "./location.ts";
import { type LevelMatch, matchChain, matchRoute, type RouteMatch, type RouteParams } from "./match.ts";
import type { Route } from "./route.ts";
import { pathOf, resolveUrl } from "./resolve-url.ts";

/** The options of `navigate`. */
export interface NavigateOptions {
  /** The state of the new history entry, `null` when none is given. */
  readonly state?: unknown;
  /** The activated route that a relative URL is resolved against. */
  readonly relativeTo?: ActivatedRoute;
}

/** Runs a watch at once: the activated routes follow the URL as soon as it changes. */
const immediately = { schedule: (task: Runnable) => task.run() };

/** A navigation to a URL that no route matches. The URL does not change. */
export class NoRouteError extends Error {
  constructor(readonly url: string) {
    super(`Cannot match any route: ${url}`);
    this.name = "NoRouteError";
  }
}

export class Router {
  /** The current URL: path, query and hash. */
  readonly url: ReadonlySignal<string>;
  /** The route that matches the current URL and its params, or undefined when none does. */
  readonly match: ReadonlySignal<RouteMatch | undefined>;
  /** The activated routes for the current URL, root first. The first one never changes. */
  readonly activated: ReadonlySignal<readonly ActivatedRoute[]>;
  private readonly root: Route;
  private readonly location: Location;
  private readonly rootRoute: ActivatedRoute;
  private readonly list = signal<readonly ActivatedRoute[]>([]);

  constructor(root: Route, location: Location) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.rootRoute = new ActivatedRoute(root, {}, [], Maybe.none());
    this.match = computed(() => matchRoute(root, location.url()));
    this.activated = this.list;
    watch(() => {
      const chain = matchChain(root, location.url());
      untracked(() => this.list.set(activatedFor(this.rootRoute, this.list(), chain)));
    }, immediately);
  }

  /**
   * Go to `url` as a new history entry, with `options.state`. `url` is a URL, or the segments of
   * one: `["todos", "7"]` is `"todos/7"`, and the query and hash then go in the last segment. A
   * relative URL is resolved against the path of `options.relativeTo` (the root when none is
   * given); see `resolveUrl`. The resolved URL is what must match: a URL no route matches is
   * rejected with a `NoRouteError`, and nothing changes. Declare a `**` route to catch those URLs.
   */
  navigate(
    url: string | readonly string[],
    options: NavigateOptions = {},
  ): Either<NoRouteError, void> {
    const path = typeof url === "string" ? url : url.join("/");
    const base = Maybe.from(options.relativeTo)
      .match({
        some: (route) => pathOf(route),
        none: () => [],
      });
    const target = resolveUrl(path, base);
    if (matchRoute(this.root, target) === undefined) {
      return Either.left(new NoRouteError(target));
    }
    this.location.go(target, options.state ?? null);
    return Either.right(undefined);
  }
}

/**
 * The activated routes for `chain`, root first. The levels that keep their previous instance are
 * the leading ones that are unchanged: a level under a changed level is made again too, since its
 * component sits inside the view of the one above.
 */
function activatedFor(
  rootRoute: ActivatedRoute,
  previous: readonly ActivatedRoute[],
  chain: readonly LevelMatch[] | undefined,
): readonly ActivatedRoute[] {
  if (chain === undefined) {
    return [rootRoute];
  }
  const levels = chain.slice(1);
  const kept = keptPrefix(previous.slice(1), levels);
  return levels.reduce<readonly ActivatedRoute[]>(
    (made, level, index) => [
      ...made,
      kept[index] ?? new ActivatedRoute(level.route, level.params, level.segments, lastOf(made)),
    ],
    [rootRoute],
  );
}

/** The last activated route of a non-empty list, which is the parent of the next level. */
function lastOf(made: readonly ActivatedRoute[]): Maybe<ActivatedRoute> {
  return Maybe.from(made[made.length - 1]);
}

/** The previous instances of the leading levels that are still the same, in order. */
function keptPrefix(
  previous: readonly ActivatedRoute[],
  levels: readonly LevelMatch[],
): readonly ActivatedRoute[] {
  const kept: ActivatedRoute[] = [];
  for (const [index, level] of levels.entries()) {
    const candidate = previous[index];
    if (candidate === undefined || !sameLevel(candidate, level)) {
      break;
    }
    kept.push(candidate);
  }
  return kept;
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

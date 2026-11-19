// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.

import { computed, Either, type ReadonlySignal, type Runnable, signal, untracked, watch } from "@tinker/core";
import { ActivatedRoute } from "./activated-route.ts";
import type { Location } from "./location.ts";
import { type LevelMatch, matchChain, matchRoute, type RouteMatch, type RouteParams } from "./match.ts";
import type { Route } from "./route.ts";

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
  /** The activated route of the root: the first of the list, which never changes. */
  readonly rootRoute: ActivatedRoute;
  private readonly list = signal<readonly ActivatedRoute[]>([]);

  constructor(root: Route, location: Location) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.rootRoute = new ActivatedRoute(root, {}, []);
    this.match = computed(() => matchRoute(root, location.url()));
    this.activated = this.list;
    watch(() => {
      const chain = matchChain(root, location.url());
      untracked(() => this.list.set(activatedFor(this.rootRoute, this.list(), chain)));
    }, immediately);
  }

  /**
   * The activated route after `own` in the list, or undefined when there is none, or when `own` is
   * no longer in it. Reads the list, so a caller in an effect runs again when the list changes.
   */
  childOf(own: ActivatedRoute): ActivatedRoute | undefined {
    const list = this.activated();
    const index = list.indexOf(own);
    return index === -1 ? undefined : list[index + 1];
  }

  /**
   * Go to `url` as a new history entry, with `state`. A URL no route matches is rejected with a
   * `NoRouteError`, and nothing changes; declare a `**` route to catch those URLs.
   */
  navigate(url: string, state: unknown = null): Either<NoRouteError, void> {
    if (matchRoute(this.root, url) === undefined) {
      return Either.left(new NoRouteError(url));
    }
    this.location.go(url, state);
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
  return [
    rootRoute,
    ...levels.map((level, index) =>
      kept[index] ?? new ActivatedRoute(level.route, level.params, level.segments)),
  ];
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

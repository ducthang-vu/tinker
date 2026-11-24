// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.

import { computed, type Injector, type ReadonlySignal, type Runnable, signal, untracked, watch } from "@tinker/core";
import { Destination, UrlBuilder } from "../destination/url-builder.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import type { Location } from "../location/location.ts";
import { type LevelMatch, matchChain, matchRoute, type RouteMatch, type RouteParams } from "./match.ts";
import type { Route } from "./route.ts";
import { None, fromNullable, match, type Maybe, Emitter, run, switchMap, Superseded, type Switched, type Cancel, type Task } from "@tinker/functional";
import { createPipeline } from "../pipeline/pipeline.ts";
import { createMatchStep } from "../pipeline/match-step.ts";
import { createRedirectStep } from "../pipeline/redirect-step.ts";
import { createGuardStep } from "../pipeline/guard-step.ts";
import { createCommitStep } from "../pipeline/commit-step.ts";
import { follow } from "../pipeline/follow.ts";
import type { MatchedRequest, NavigationRequest } from "../pipeline/request.ts";
import type { NavigationOutcome, NavigationRef, Rejected } from "../pipeline/navigation-outcome.ts";
import type { Stop } from "../pipeline/stop.ts";

/** The options of `navigate`. */
export interface NavigateOptions {
  /** The state of the new history entry, `null` when none is given. */
  readonly state?: unknown;
}

/** Runs a watch at once: the activated routes follow the URL as soon as it changes. */
const immediately = { schedule: (task: Runnable) => task.run() };

/** The router: the current URL, the matched route, the activated routes, and navigate. */
export class Router {
  /** The current URL: path, query and hash. */
  readonly url: ReadonlySignal<string>;
  /** The route that matches the current URL and its params, or undefined when none does. */
  readonly match: ReadonlySignal<RouteMatch | undefined>;
  /** The activated routes for the current URL, root first. The first one never changes. */
  readonly activated: ReadonlySignal<readonly ActivatedRoute[]>;
  /** The activated route of the root: the first of the list, which never changes. */
  readonly rootRoute: ActivatedRoute;
  private readonly root: Route;
  private readonly location: Location;
  private readonly list = signal<readonly ActivatedRoute[]>([]);
  private readonly requests = Emitter.create<NavigationRequest>();
  /** The promises of the navigations not yet settled, by request id. */
  private readonly waiting = new Map<number, (committed: boolean) => void>();
  private readonly pipeline: (request: NavigationRequest) => Task<MatchedRequest, Stop>;
  private readonly stopRouting: Cancel;
  private nextId = 1;
  private latestId = 0;

  /**
   * The router over a route tree, reading and writing the URL through `location`.
   *
   * @param root The root of the route tree, which is never shown.
   * @param location The router's view of the browser location.
   * @param injector The injector whose context the routes' guards and redirects run in.
   */
  constructor(root: Route, location: Location, injector: Injector) {
    this.root = root;
    this.location = location;
    this.url = location.url;
    this.rootRoute = new ActivatedRoute(root, {}, [], None.of());
    this.match = computed(() => matchRoute(root, location.url()));
    this.activated = this.list;
    this.pipeline = createPipeline({
      match: createMatchStep(root),
      redirect: createRedirectStep(injector),
      guards: createGuardStep(injector),
      commit: createCommitStep({
        browser: location,
        base: "",
        activate: (matched) => this.activate(matched.chain),
      }),
    });
    watch(() => {
      const chain = matchChain(root, location.url());
      untracked(() => this.activate(chain));
    }, immediately);
    // One navigation at a time: a newer request supersedes the one still running.
    this.stopRouting = run(
      switchMap(this.requests.stream, (request) => follow(this.pipeline, request)),
      { next: (item) => this.settle(item) },
    );
  }

  /**
   * Go to `destination` as a new history entry, with `options.state`. The navigation runs through
   * the guards and redirects of the matched routes. It resolves `true` when it commits, and `false`
   * when a guard or a redirect stops it, or a newer navigation replaces it before it commits. A
   * stopped navigation changes nothing.
   *
   * @param destination Where to go, built by the URL builder or parsed from a string with `parse`.
   * @param options The state of the new history entry.
   * @returns A promise of whether the navigation committed.
   */
  navigate(destination: Destination, options: NavigateOptions = {}): Promise<boolean> {
    const id = this.nextId;
    this.nextId += 1;
    this.latestId = id;
    const request: NavigationRequest = {
      id,
      destination,
      state: options.state ?? null,
      arrival: "push",
      redirectFrom: [],
    };
    return new Promise<boolean>((resolve) => {
      this.waiting.set(id, resolve);
      this.requests.emit(request);
    });
  }

  /**
   * The destination a URL string names in this router's route tree. Throws a ParseError when no
   * route matches it, or when it is malformed. The one place a string becomes a destination.
   *
   * @param url The URL to parse: a path, with an optional query and fragment.
   * @returns The destination the URL names.
   * @throws ParseError when the URL matches no route or is malformed.
   */
  parse(url: string): Destination {
    return UrlBuilder.for(this.root.children ?? []).parse(url);
  }

  /** Stops routing navigations when the injector is destroyed. */
  onDestroy(): void {
    this.stopRouting();
  }

  /**
   * Updates the activated routes to `chain`, keeping the instances that are still the same.
   *
   * @param chain The levels the current URL matches, root first.
   */
  private activate(chain: readonly LevelMatch[] | undefined): void {
    this.list.set(activatedFor(this.rootRoute, this.list(), chain));
  }

  /**
   * Resolves the promise of a navigation that has settled.
   *
   * @param item The settled navigation: its request and its outcome.
   */
  private settle(item: Switched<NavigationRequest, MatchedRequest, Rejected>): void {
    const navigation: NavigationRef = { id: item.value.id, destination: item.value.destination };
    const outcome = match<MatchedRequest, Rejected | Superseded, NavigationOutcome>(item.outcome, {
      Right: (committed) => ({ kind: "done", navigation: committed }),
      Left: (reason) => reason instanceof Superseded
        ? { kind: "cancelled", navigation, by: this.latestId }
        : reason,
    });
    match(fromNullable(this.waiting.get(item.value.id)), {
      Some: (resolve) => resolve(outcome.kind === "done"),
      None: () => undefined,
    });
    this.waiting.delete(item.value.id);
  }
}

/**
 * The activated routes for `chain`, root first. The levels that keep their previous instance are
 * the leading ones that are unchanged: a level under a changed level is made again too, since its
 * component sits inside the view of the one above.
 * @param rootRoute
 * @param previous
 * @param chain
 * @returns The activated routes, root first, with the kept instances reused.
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

/**
 * The last activated route of a non-empty list, which is the parent of the next level.
 * @param made
 * @returns The last activated route as a Maybe: None for an empty list.
 */
function lastOf(made: readonly ActivatedRoute[]): Maybe<ActivatedRoute> {
  return fromNullable(made[made.length - 1]);
}

/**
 * The previous instances of the leading levels that are still the same, in order.
 * @param previous
 * @param levels
 * @returns The previous instances that are still the same, in order.
 */
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

/**
 * Whether an activated route is still the level it was made for.
 * @param activated
 * @param level
 * @returns True when the activated route is still the level it was made for.
 */
function sameLevel(activated: ActivatedRoute, level: LevelMatch): boolean {
  return activated.route === level.route
    && sameParams(activated.params, level.params)
    && sameSegments(activated.segments, level.segments);
}

/**
 *
 * @param a
 * @param b
 * @param a The first params.
 * @param b The second params.
 * @returns True when both hold the same keys and values.
 */
function sameParams(a: RouteParams, b: RouteParams): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 *
 * @param a
 * @param b
 * @param a The first segments.
 * @param b The second segments.
 * @returns True when they are the same, in order.
 */
function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

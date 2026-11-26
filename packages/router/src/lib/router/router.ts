// The router: the current URL, the matched route and params, the list of activated routes, and
// `navigate`. It reads and writes the URL through Location, so it follows back and forward moves.

import { computed, type Injector, type ReadonlySignal, signal } from "@tinker/core";
import { type Stream } from "@tinker/functional";
import { type NavigationEvent, finalEventOf } from "./navigation-event.ts";
import type { AppPath } from "../destination/app-path.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import type { Location } from "../location/location.ts";
import { type LevelMatch, matchChain, matchOfChain, type RouteMatch, type RouteParams } from "./match.ts";
import type { Route } from "./route.ts";
import { seedChildren } from "./lazy-children.ts";
import { parseAppPath } from "../destination/app-path-parse.ts";
import { None, fromNullable, map, match, type Maybe, Emitter, run, switchMap, Superseded, type Switched, type Cancel, type Task } from "@tinker/functional";
import { createPipeline } from "../pipeline/pipeline.ts";
import { createMatchStep } from "../pipeline/match-step.ts";
import { createRedirectStep } from "../pipeline/redirect-step.ts";
import { createDeactivateStep, createGuardStep } from "../pipeline/guard-step.ts";
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

/** The URL and state of the last committed navigation. */
interface Committed {
  /** The app-relative URL, with its query and fragment. */
  readonly url: string;
  /** The history state of the entry. */
  readonly state: unknown;
}

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
  /** The route tree, read by the path builder on each step. */
  readonly routes: ReadonlySignal<Route>;
  private readonly root: Route;
  private readonly location: Location;
  private readonly list = signal<readonly ActivatedRoute[]>([]);
  /** The leaf of the committed chain, with its params: what `match` shows. */
  private readonly leaf = signal<RouteMatch | undefined>(undefined);
  private readonly requests = Emitter.create<NavigationRequest>();
  private readonly eventSource = Emitter.create<NavigationEvent>();
  /** The navigation events: STARTED when a navigation begins, then DONE, CANCELLED, or REJECTED. */
  readonly events: Stream<NavigationEvent>;
  /** The promises of the navigations not yet settled, by request id. */
  private readonly waiting = new Map<number, (outcome: NavigationOutcome) => void>();
  private readonly pipeline: (request: NavigationRequest) => Task<MatchedRequest, Stop>;
  private readonly stopRouting: Cancel;
  private readonly stopPops: () => void;
  /** The last committed URL and state: where a rejected back or forward move returns to. */
  private committed: Committed;
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
    this.routes = signal<Route>(root);
    this.events = this.eventSource.stream;
    this.rootRoute = new ActivatedRoute(root, {}, [], None.of());
    this.match = this.leaf;
    this.activated = this.list;
    this.pipeline = createPipeline({
      match: createMatchStep(root, { injector }),
      redirect: createRedirectStep(injector),
      deactivate: createDeactivateStep(injector),
      guards: createGuardStep(injector),
      commit: createCommitStep({
        browser: location,
        activate: (matched) => this.activate(matched.chain),
      }),
    });
    this.committed = { url: location.url(), state: location.state() };
    // One navigation at a time: a newer request supersedes the one still running.
    this.stopRouting = run(
      switchMap(this.requests.stream, (request) => {
        const started = this.started(request);
        this.eventSource.emit({ type: "STARTED", source: "START", payload: started });
        return follow(this.pipeline, started);
      }),
      { next: (item) => this.settle(item) },
    );
    // A back or forward move is a navigation too: it goes through the guards like any other.
    this.stopPops = location.onPop((url, state) => this.popped(url, state));
    // The URL the app starts at is a navigation too: a lazy route on it loads before it is shown.
    this.start(location.url(), location.state());
  }

  /**
   * Runs the URL the app starts at through the pipeline, as a navigation that replaces the entry it
   * is on. A URL no route takes shows nothing, as it did before.
   *
   * @param url The URL the browser is on.
   * @param state The state of the entry.
   */
  private start(url: string, state: unknown): void {
    let destination: AppPath;
    try {
      destination = parseAppPath(this.root, url);
    } catch {
      this.activate(undefined);
      return;
    }
    const id = this.nextId;
    this.nextId += 1;
    this.latestId = id;
    this.requests.emit({
      id,
      destination,
      state,
      arrival: "start",
      redirectFrom: [],
      activatedRoutes: [],
      trace: [],
    });
  }

  /**
   * Go to `destination` as a new history entry, with `options.state`. The navigation runs through
   * the guards and redirects of the matched routes. It resolves with its outcome: `done` when it
   * commits; `cancelled` when a newer navigation replaces it first; and `rejected`, with the
   * reason: `no-route` when no route takes the path, `guard` when a guard said no (naming the
   * route), or `failed` when a step threw (with the cause). A rejected or cancelled navigation
   * changes nothing.
   *
   * @param destination Where to go, built by the injected `AppPathBuilder`.
   * @param options The state of the new history entry.
   * @returns A promise of the outcome of the navigation.
   */
  navigate(destination: AppPath, options: NavigateOptions = {}): Promise<NavigationOutcome> {
    const id = this.nextId;
    this.nextId += 1;
    this.latestId = id;
    const request: NavigationRequest = {
      id,
      destination,
      state: options.state ?? null,
      arrival: "push",
      redirectFrom: [],
      activatedRoutes: [],
      trace: [],
    };
    return new Promise<NavigationOutcome>((resolve) => {
      this.waiting.set(id, resolve);
      this.requests.emit(request);
    });
  }

  /**
   * Replaces the routes the router matches, and matches the current URL against them again. The
   * URL is not changed, and no history entry is added. If no new route takes the URL, nothing is
   * shown until the URL changes.
   *
   * @param routes The new top-level routes.
   */
  resetRoutes(routes: readonly Route[]): void {
    seedChildren(this.root, routes);
    this.start(this.location.url(), this.location.state());
  }

  /** Stops routing navigations when the injector is destroyed. */
  onDestroy(): void {
    this.stopRouting();
    this.stopPops();
  }

  /**
   * Updates the activated routes to `chain`, keeping the instances that are still the same.
   *
   * @param chain The levels the current URL matches, root first.
   */
  private activate(chain: readonly LevelMatch[] | undefined): void {
    this.list.set(activatedFor(this.rootRoute, this.list(), chain));
    this.leaf.set(matchOfChain(chain));
  }

  /**
   * The request as the pipeline starts it: the route it leaves is the last committed one.
   *
   * @param request The request, as `navigate` or a back move made it.
   * @returns The request with its origin set.
   */
  private started(request: NavigationRequest): NavigationRequest {
    return { ...request, activatedRoutes: this.list() };
  }

  /**
   * A back or forward move: the browser has already moved, so the move is a navigation with
   * arrival `pop`. A URL that no route takes is restored at once, since there is no navigation to
   * report it.
   *
   * @param url The URL the browser moved to.
   * @param state The state of the entry the browser moved to.
   */
  private popped(url: string, state: unknown): void {
    const id = this.nextId;
    this.nextId += 1;
    this.latestId = id;
    try {
      const destination = parseAppPath(this.routes(), url);
      this.requests.emit({
        id,
        destination,
        state,
        arrival: "pop",
        redirectFrom: [],
        activatedRoutes: [],
        trace: [],
      });
    } catch {
      this.restore();
    }
  }

  /**
   * Puts the browser back on the last committed URL, replacing the entry, so the routes and the
   * browser agree again after a rejected back or forward move.
   */
  private restore(): void {
    this.location.replace(this.committed.url, this.committed.state);
  }

  /**
   * Resolves the promise of a navigation that has settled.
   *
   * @param item The settled navigation: its request and its outcome.
   */
  private settle(item: Switched<NavigationRequest, MatchedRequest, Rejected>): void {
    const navigation: NavigationRef = {
      id: item.value.id,
      destination: item.value.destination,
      trace: item.value.trace,
    };
    const outcome = match<MatchedRequest, Rejected | Superseded, NavigationOutcome>(item.outcome, {
      Right: (committed) => ({ kind: "done", navigation: committed, meta: committed.trace }),
      Left: (reason) => reason instanceof Superseded
        ? { kind: "cancelled", navigation, by: this.latestId, meta: navigation.trace }
        : reason,
    });
    if (outcome.kind === "done") {
      this.committed = {
        url: outcome.navigation.destination.format(),
        state: outcome.navigation.state,
      };
    } else if (outcome.kind === "rejected" && item.value.arrival === "pop") {
      this.restore();
    }
    // Every navigation has a waiting promise, so the lookup always finds one.
    this.eventSource.emit(finalEventOf(outcome));
    map(fromNullable(this.waiting.get(item.value.id)), (resolve) => resolve(outcome));
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

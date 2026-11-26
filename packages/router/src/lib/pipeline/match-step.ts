// The match step: walks the route tree from the root, down the parts of the destination, and
// returns the levels that match. It is a Task, because a route may have to load its children
// first. A route runs its canMatch gates before the walk goes on: a STOP skips the route, so the
// next route with a matching path is tried. A route with loadChildren then runs its canLoad gates,
// and loads its children once; a STOP there rejects the navigation, so nothing is downloaded past
// it.
//
// The walk passes its result on to a callback. When every gate is synchronous, the walk completes
// before the step returns, as the other steps do; only a load that is still running waits.
// Cancelling the task cancels its gates and gives up its hold on any load, so a superseded
// navigation stops.

import { type Injector, runInInjectionContext } from "@tinker/core";
import { type Cancel, fromComputation, run, type Task } from "@tinker/functional";
import { loadChildrenOnce, loadedChildrenOf } from "../router/lazy-children.ts";
import { consume, type LevelMatch } from "../router/match.ts";
import type { Route } from "../router/route.ts";
import type { RouteGate } from "./guard-step.ts";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { MatchStep } from "./steps.ts";
import { failed, guardRejected, noRoute, Redirect, type Stop } from "./stop.ts";

/** The most redirects one navigation may follow. A navigation past it fails at the match step. */
export const MAX_REDIRECTS = 10;

/** What the match step needs besides the tree: the injector the gates run in. */
export interface MatchOptions {
  /** The injector whose context the gates run in. */
  readonly injector: Injector;
}

/** What one navigation's walk holds: what to give up when the navigation is cancelled. */
interface Scope {
  readonly releases: Cancel[];
}

/** How the walk of one route ended: with the levels it matched, with no match, or with a stop. */
type Walk
  = | { readonly kind: "found"; readonly levels: readonly LevelMatch[] }
    | { readonly kind: "miss" }
    | { readonly kind: "stop"; readonly stop: Stop };

/** What the gates of a route said: keep going, skip the route, or stop the navigation. */
type Verdict
  = | { readonly kind: "allow" }
    | { readonly kind: "skip" }
    | { readonly kind: "stop"; readonly stop: Stop };

/** What the children of a route are: none, the routes, or a stop from loading them. */
type Children
  = | { readonly kind: "none" }
    | { readonly kind: "routes"; readonly routes: readonly Route[] }
    | { readonly kind: "stop"; readonly stop: Stop };

/** A task's outcome, as a value: the walk branches on it, and a task never throws out of it. */
type Settled<T>
  = | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: unknown };

const MISS: Walk = { kind: "miss" };

/**
 * Runs a task, and passes its outcome on as a value. A throw while the task is made is a failure.
 * The task is kept on the scope, so cancelling the scope cancels it.
 *
 * @param scope The scope of the walk: nothing starts once it is cancelled.
 * @param start Makes the task.
 * @param done Receives the outcome.
 */
function settle<T>(
  scope: Scope,
  start: () => Task<T, unknown>,
  done: (settled: Settled<T>) => void,
): void {
  let made: Task<T, unknown>;
  try {
    made = start();
  } catch (error) {
    done({ ok: false, error });
    return;
  }
  scope.releases.push(run(made, {
    ok: (value) => done({ ok: true, value }),
    error: (error) => done({ ok: false, error }),
  }));
}

/**
 * Runs the gates of a route in order, in the injector's context. A STOP skips the route when
 * `onStop` is "skip", and rejects the navigation when it is "reject".
 *
 * @param options The injector the gates run in.
 * @param scope The scope of the walk.
 * @param request The navigation being matched.
 * @param route The route whose gates these are.
 * @param gates The gates still to run, in order.
 * @param onStop What a STOP does: skip the route, or reject the navigation.
 * @param done Receives the verdict.
 */
function gatesOf(
  options: MatchOptions,
  scope: Scope,
  request: NavigationRequest,
  route: Route,
  gates: readonly RouteGate[],
  onStop: "skip" | "reject",
  done: (verdict: Verdict) => void,
): void {
  const [gate, ...later] = gates;
  if (gate === undefined) {
    done({ kind: "allow" });
    return;
  }
  const invoke = (): ReturnType<RouteGate> =>
    runInInjectionContext(options.injector, () => gate(request));
  settle(scope, invoke, (settled) => {
    if (!settled.ok) {
      done({ kind: "stop", stop: failed(request, settled.error) });
      return;
    }
    const command = settled.value;
    if (command.type === "ALLOW") {
      gatesOf(options, scope, request, route, later, onStop, done);
    } else if (command.type === "REDIRECT") {
      done({ kind: "stop", stop: Redirect.of(request, command.payload.path) });
    } else {
      done(onStop === "skip"
        ? { kind: "skip" }
        : { kind: "stop", stop: guardRejected(request, route.path, command) });
    }
  });
}

/**
 * The children of a route: its own, or, for a lazy route, the loaded ones. A lazy route that is not
 * loaded runs its canLoad gates, then holds its load.
 *
 * @param options The injector the gates run in.
 * @param scope The scope of the walk.
 * @param request The navigation being matched.
 * @param route The route whose children these are.
 * @param done Receives the children.
 */
function childrenOf(
  options: MatchOptions,
  scope: Scope,
  request: NavigationRequest,
  route: Route,
  done: (children: Children) => void,
): void {
  if (route.children !== undefined) {
    done({ kind: "routes", routes: route.children });
    return;
  }
  const loader = route.loadChildren;
  if (loader === undefined) {
    done({ kind: "none" });
    return;
  }
  const known = loadedChildrenOf(route);
  if (known !== undefined) {
    done({ kind: "routes", routes: known });
    return;
  }
  gatesOf(options, scope, request, route, route.canLoad ?? [], "reject", (verdict) => {
    if (verdict.kind === "stop") {
      done({ kind: "stop", stop: verdict.stop });
      return;
    }
    const hold = loadChildrenOnce(route, loader);
    scope.releases.push(() => hold.release());
    hold.promise.then(
      (routes) => done({ kind: "routes", routes }),
      (cause: unknown) => done({ kind: "stop", stop: failed(request, cause) }),
    );
  });
}

/**
 * Walks `route` and its descendants against `segments`, and passes on the levels that match, no
 * match, or a stop.
 *
 * @param options The injector and the lazy routes.
 * @param scope The scope of the walk.
 * @param request The navigation being matched.
 * @param route The route to walk.
 * @param segments The segments the route and its descendants must match.
 * @param done Receives how the walk ended.
 */
function walk(
  options: MatchOptions,
  scope: Scope,
  request: NavigationRequest,
  route: Route,
  segments: readonly string[],
  done: (result: Walk) => void,
): void {
  if (route.path === "**") {
    done({ kind: "found", levels: [{ route, params: {}, segments }] });
    return;
  }
  const consumed = consume(route.path, segments);
  if (consumed === undefined) {
    done(MISS);
    return;
  }
  gatesOf(options, scope, request, route, route.canMatch ?? [], "skip", (verdict) => {
    if (verdict.kind === "stop") {
      done({ kind: "stop", stop: verdict.stop });
      return;
    }
    if (verdict.kind === "skip") {
      done(MISS);
      return;
    }
    const rest = segments.slice(consumed.count);
    const own: LevelMatch = {
      route,
      params: consumed.params,
      segments: segments.slice(0, consumed.count),
    };
    childrenOf(options, scope, request, route, (children) => {
      if (children.kind === "stop") {
        done({ kind: "stop", stop: children.stop });
      } else if (children.kind === "none") {
        done(rest.length === 0 ? { kind: "found", levels: [own] } : MISS);
      } else {
        walkEach(options, scope, request, children.routes, rest, own, done);
      }
    });
  });
}

/**
 * Walks the routes in order, and passes on the first that matches, or a stop.
 *
 * @param options The injector and the lazy routes.
 * @param scope The scope of the walk.
 * @param request The navigation being matched.
 * @param routes The routes to try, in order.
 * @param segments The segments the routes must match.
 * @param own The level of the parent route, which the matches go below.
 * @param done Receives how the walk ended.
 */
function walkEach(
  options: MatchOptions,
  scope: Scope,
  request: NavigationRequest,
  routes: readonly Route[],
  segments: readonly string[],
  own: LevelMatch,
  done: (result: Walk) => void,
): void {
  const [first, ...later] = routes;
  if (first === undefined) {
    done(MISS);
    return;
  }
  walk(options, scope, request, first, segments, (below) => {
    if (below.kind === "found") {
      done({ kind: "found", levels: [own, ...below.levels] });
    } else if (below.kind === "stop") {
      done(below);
    } else {
      walkEach(options, scope, request, later, segments, own, done);
    }
  });
}

/**
 * The match step for a tree with `root` at its top. Cancelling its task cancels the gates that are
 * running, and gives up the holds on the loads, so a superseded navigation stops downloading.
 *
 * @param root The root route of the tree.
 * @param options The injector the gates run in.
 * @returns A match step: a Task of the request with its levels, or a stop.
 */
export function createMatchStep(root: Route, options: MatchOptions): MatchStep {
  return (request) =>
    fromComputation<MatchedRequest, Stop>((ok, error) => {
      const scope: Scope = { releases: [] };
      if (request.redirectFrom.length > MAX_REDIRECTS) {
        error(failed(request, new Error(`more than ${MAX_REDIRECTS} redirects`)));
      } else {
        const segments = request.destination.segments.map((part) => part.value);
        walk(options, scope, request, root, segments, (result) => {
          if (result.kind === "found") {
            ok({ ...request, chain: result.levels });
          } else if (result.kind === "miss") {
            error(noRoute(request));
          } else {
            error(result.stop);
          }
        });
      }
      return () => {
        for (const release of scope.releases) {
          release();
        }
      };
    });
}

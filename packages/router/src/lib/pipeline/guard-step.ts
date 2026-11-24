// The guard step: runs the guards of the matched routes, root first, each route's in order. A guard
// returns true to allow, false to reject, or a URL to redirect. It runs in the injection context of
// the router, and may return a Task for work that takes time. The first guard that does not allow
// stops the step; a throw, or a failing task, stops it with a Failed.

import { type Injector, runInInjectionContext } from "@tinker/core";
import { fail, flatMap, fromComputation, run, succeed, type Task } from "@tinker/functional";
import { Destination } from "../destination/url-builder.ts";
import type { MatchedRequest } from "./request.ts";
import type { GuardStep } from "./steps.ts";
import { failed, guardRejected, Redirect, type Stop } from "./stop.ts";

/** A guard's answer: allow (true), reject (false), or redirect to a URL. */
export type GuardResult = boolean | Destination;

/** A guard of a route. It may return its answer, or a Task of it for work that takes time. */
export type Guard = (
  request: MatchedRequest,
) => GuardResult | Task<GuardResult, unknown>;

/**
 * The guard step for a router with `injector`.
 *
 * @param injector The injector whose context the guards run in.
 * @returns A guard step: the request when every guard allows, or the first stop.
 */
export function createGuardStep(injector: Injector): GuardStep {
  return (matched) =>
    matched.chain.reduce<Task<MatchedRequest, Stop>>(
      (previous, level) =>
        flatMap(previous, () =>
          guardsOf(injector, matched, level.route.path, level.route.canActivate ?? [])),
      succeed(matched),
    );
}

/** The guards of one route, in order. */
function guardsOf(
  injector: Injector,
  matched: MatchedRequest,
  route: string,
  guards: readonly Guard[],
): Task<MatchedRequest, Stop> {
  return guards.reduce<Task<MatchedRequest, Stop>>(
    (previous, guard) =>
      flatMap(previous, () =>
        flatMap(callGuard(injector, matched, guard), (verdict) =>
          decide(matched, route, verdict))),
    succeed(matched),
  );
}

/** One guard, as a task of its answer. A throw, or a failing task, becomes a Failed. */
function callGuard(
  injector: Injector,
  matched: MatchedRequest,
  guard: Guard,
): Task<GuardResult, Stop> {
  return fromComputation<GuardResult, Stop>((ok, error) => {
    let produced: GuardResult | Task<GuardResult, unknown>;
    try {
      produced = runInInjectionContext(injector, () => guard(matched));
    } catch (cause) {
      error(failed(matched, cause));
      return;
    }
    if (typeof produced !== "boolean" && !(produced instanceof Destination)) {
      return run(produced, {
        ok,
        error: (cause) => error(failed(matched, cause)),
      });
    }
    ok(produced);
  });
}

/** Turns an answer into the navigation's next step: allowed, rejected, or redirected. */
function decide(
  matched: MatchedRequest,
  route: string,
  verdict: GuardResult,
): Task<MatchedRequest, Stop> {
  if (verdict === true) {
    return succeed(matched);
  }
  if (verdict === false) {
    return fail(guardRejected(matched, route));
  }
  return fail(Redirect.of(matched, verdict));
}

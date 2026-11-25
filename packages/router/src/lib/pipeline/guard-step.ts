// The guard step: runs the guards of the matched routes, root first, each route's in order. A guard
// returns a Task of a command: ALLOW lets the navigation through, STOP rejects it, and REDIRECT
// sends it to another URL. A guard that waits returns a Task that succeeds later; a sync guard
// returns a Task that succeeds at once. The first command that is not ALLOW stops the step, and a
// throw, or a failing task, stops it with a Failed.

import { type Injector, runInInjectionContext } from "@tinker/core";
import { fail, flatMap, fromComputation, run, succeed, type Task } from "@tinker/functional";
import type { AppPath } from "../destination/app-path.ts";
import type { ActivatedRoute } from "../state/activated-route.ts";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { DeactivateStep, GuardStep } from "./steps.ts";
import { failed, guardRejected, Redirect, type Stop } from "./stop.ts";

/** The payload of a STOP command: why the guard stopped the navigation, if it gives a reason. */
export class StopPayload {
  /**
   * The payload of a STOP.
   *
   * @param reason Why the navigation is stopped, for the app to show or log.
   */
  constructor(readonly reason?: string) {}
}

/** The STOP command: the guard rejects the navigation, and the navigation changes nothing. */
export class StopCommand {
  /** The command's type. */
  readonly type = "STOP" as const;

  /**
   * A STOP command.
   *
   * @param payload Why the navigation is stopped.
   */
  constructor(readonly payload: StopPayload) {}
}

/** The payload of a REDIRECT command: the URL to go to instead, and why. */
export class RedirectPayload {
  /**
   * The payload of a REDIRECT.
   *
   * @param path The URL to go to instead.
   * @param reason Why the navigation is redirected, for the app to show or log.
   */
  constructor(
    readonly path: AppPath,
    readonly reason?: string,
  ) {}
}

/** The REDIRECT command: the navigation goes to another URL instead. */
export class RedirectCommand {
  /** The command's type. */
  readonly type = "REDIRECT" as const;

  /**
   * A REDIRECT command.
   *
   * @param payload The URL to go to, and why.
   */
  constructor(readonly payload: RedirectPayload) {}
}

/** The ALLOW command: the guard lets the navigation through. */
export class AllowCommand {
  /** The command's type. */
  readonly type = "ALLOW" as const;
}

/** What a guard returns: a command the router carries out. */
export type RouteGuardCommand = AllowCommand | StopCommand | RedirectCommand;

/** A guard of a route. It returns a Task of its command: `succeed` for a sync guard. */
export type Guard = (request: MatchedRequest) => Task<RouteGuardCommand, unknown>;

/**
 * A deactivate guard: asked when the navigation leaves a route. It gets the navigation and the
 * activated route it leaves.
 */
export type DeactivateGuard = (
  request: NavigationRequest,
  leaving: ActivatedRoute,
) => Task<RouteGuardCommand, unknown>;

/**
 * The deactivate step for a router with `injector`: runs the deactivate guards of the routes the
 * navigation leaves, from the last to the first, each route's in order.
 *
 * @param injector The injector whose context the guards run in.
 * @returns A deactivate step: the request when every guard allows, or the first stop.
 */
export function createDeactivateStep(injector: Injector): DeactivateStep {
  return (matched) =>
    [...matched.activatedRoutes].reverse()
      .reduce<Task<MatchedRequest, Stop>>(
        (previous, activated) =>
          flatMap(previous, (current) => deactivateOf(injector, current, activated)),
        succeed(matched),
      );
}

/**
 * The deactivate guards of one activated route, in order.
 *
 * @param injector The injector whose context the guards run in.
 * @param matched The navigation being guarded.
 * @param leaving The activated route being left.
 * @returns The request when every guard allows, or the first stop.
 */
function deactivateOf(
  injector: Injector,
  matched: MatchedRequest,
  leaving: ActivatedRoute,
): Task<MatchedRequest, Stop> {
  const guards = leaving.route.canDeactivate ?? [];
  return guards.reduce<Task<MatchedRequest, Stop>>(
    (previous, guard) =>
      flatMap(previous, (current) =>
        flatMap(callGuard(injector, current, () => guard(current, leaving)), (command) =>
          decide(current, leaving.route.path, command, "deactivate"))),
    succeed(matched),
  );
}

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

/**
 * The guards of one route, in order.
 *
 * @param injector The injector whose context the guards run in.
 * @param matched The navigation being guarded.
 * @param route The path of the route whose guards these are.
 * @param guards The route's guards, in order.
 * @returns The request when every guard allows, or the first stop.
 */
function guardsOf(
  injector: Injector,
  matched: MatchedRequest,
  route: string,
  guards: readonly Guard[],
): Task<MatchedRequest, Stop> {
  return guards.reduce<Task<MatchedRequest, Stop>>(
    (previous, guard) =>
      flatMap(previous, (current) =>
        flatMap(callGuard(injector, current, () => guard(current)), (command) =>
          decide(current, route, command, "guard"))),
    succeed(matched),
  );
}

/**
 * One guard, as a task of its command. A throw, or a failing task, becomes a Failed.
 *
 * @param injector The injector whose context the guard runs in.
 * @param matched The navigation being guarded.
 * @param invoke Calls the guard, and returns its task.
 * @returns A task of the guard's command. A throw, or a failing task, stops with Failed.
 */
function callGuard(
  injector: Injector,
  matched: MatchedRequest,
  invoke: () => Task<RouteGuardCommand, unknown>,
): Task<RouteGuardCommand, Stop> {
  return fromComputation<RouteGuardCommand, Stop>((ok, error) => {
    let produced: Task<RouteGuardCommand, unknown>;
    try {
      produced = runInInjectionContext(injector, invoke);
    } catch (cause) {
      error(failed(matched, cause));
      return;
    }
    return run(produced, {
      ok,
      error: (cause) => error(failed(matched, cause)),
    });
  });
}

/**
 * The request with one more entry in its trace.
 *
 * @param matched The navigation.
 * @param entry What the step did.
 * @returns The navigation with the entry added.
 */
function traced(matched: MatchedRequest, entry: unknown): MatchedRequest {
  return { ...matched, trace: [...matched.trace, entry] };
}

/**
 * Carries out a guard's command: lets the navigation through, stops it, or redirects it.
 *
 * @param matched The navigation the guard was asked about.
 * @param route The path of the route whose guard returned the command.
 * @param command The command the guard returned.
 * @param step
 * @returns The next step: the request when allowed, or a stop.
 */
function decide(
  matched: MatchedRequest,
  route: string,
  command: RouteGuardCommand,
  step: "guard" | "deactivate",
): Task<MatchedRequest, Stop> {
  const entry = { step, route, command: command.type };
  switch (command.type) {
    case "ALLOW":
      return succeed(traced(matched, entry));
    case "STOP":
      return fail(guardRejected(traced(matched, entry), route, command));
    case "REDIRECT":
      return fail(Redirect.of(traced(matched, entry), command.payload.path));
  }
}

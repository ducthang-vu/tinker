// The navigation pipeline: the work between a navigation's URL and its commit. Given a URL, it
// matches the URL, runs the redirects of the matched routes, runs the guards of every matched route
// (root first, each route's in order) until one says otherwise, and follows a redirect from the
// start. Its result is a Plan, which the router commits. The pipeline never touches the browser or
// the router's state: a failed plan changes nothing.
//
// Each step is dispatched as an action on the navigation's trace (see actions.ts), so the sequence
// of steps is visible to a subscriber. A step is a Task, so a guard may be asynchronous, and
// cancelling the Task stops the step that runs. A guard is called in the router's injection
// context, so it can `inject`.

import { Injector, runInInjectionContext, Task } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import type { NavigationTrace } from "./actions.ts";
import { keptLevels } from "./activation.ts";
import { type LevelMatch, matchChain, matchOf } from "./match.ts";
import {
  type GuardResult,
  type Navigation,
  type NavigationError,
  NavigationFailedError,
  NavigationRejectedError,
  NoRouteError,
} from "./navigation.ts";
import type { Route } from "./route.ts";

/**
 * The most redirects one navigation may follow. A guard that redirects in a loop fails the
 * navigation.
 */
const MAX_REDIRECTS = 10;

/** A pipeline outcome: a value, or the error that stopped the navigation. */
export type Outcome<T> = Task<T, NavigationError | Error>;

/** What the pipeline needs from the router, at the moment a navigation starts. */
export interface PipelineContext {
  readonly root: Route;
  readonly injector: Injector;
  /** The activated routes now, root first. The levels that stay are taken from here. */
  readonly activated: readonly ActivatedRoute[];
  /** The URL the router is at now, or `""` before the first navigation. */
  readonly from: string;
  /** Where the steps of this navigation are dispatched. */
  readonly trace: NavigationTrace;
}

/** What a navigation that passed the pipeline commits. */
export interface Plan {
  readonly url: string;
  readonly state: unknown;
  /** The levels the URL matches, root first. */
  readonly chain: readonly LevelMatch[];
  /** The leading activated routes that stay as they are. */
  readonly kept: readonly ActivatedRoute[];
}

/**
 * Plans the navigation to `url`, with `state`: the outcome is the plan to commit, or the failure.
 */
export function planNavigation(
  context: PipelineContext,
  url: string,
  state: unknown,
): Outcome<Plan> {
  return planAt(context, url, state, 0);
}

function planAt(
  context: PipelineContext,
  url: string,
  state: unknown,
  redirects: number,
): Outcome<Plan> {
  const chain = matchChain(context.root, url);
  const attempt: Outcome<readonly LevelMatch[]> = chain === undefined
    ? Task.fail(new NoRouteError(url))
    : Task.succeed(chain);
  return Task.flatMap(
    context.trace.observe("MATCH_ROUTE", { url }, attempt),
    (matched): Outcome<Plan> => {
      const navigation: Navigation = {
        url,
        state,
        match: matchOf(matched),
        from: context.from,
      };
      const kept = keptLevels(context.activated, matched.slice(1));
      return Task.flatMap(
        runRedirects(context.injector, navigation, matched),
        (target): Outcome<Plan> => {
          if (target !== undefined) {
            return redirect(context, url, target, state, redirects, "route");
          }
          return Task.flatMap(
            runGuards(context, navigation, matched),
            (verdict): Outcome<Plan> => {
              if (typeof verdict === "string") {
                return redirect(context, url, verdict, state, redirects, "guard");
              }
              return Task.succeed({ url, state, chain: matched, kept });
            },
          );
        },
      );
    },
  );
}

/**
 * The URL the redirects of the matched routes send the navigation to, root first: the first
 * redirect that returns one decides. `undefined` when none does.
 */
function runRedirects(
  injector: Injector,
  navigation: Navigation,
  chain: readonly LevelMatch[],
): Outcome<string | undefined> {
  const redirects = chain.flatMap((level) =>
    level.route.redirect === undefined ? [] : [level.route.redirect]);
  return redirects.reduce<Outcome<string | undefined>>(
    (previous, redirectOf) =>
      Task.flatMap(previous, (target): Outcome<string | undefined> =>
        target === undefined
          ? step(injector, navigation, () => redirectOf(navigation))
          : Task.succeed(target)),
    Task.succeed(undefined),
  );
}

/**
 * Plans the navigation to the target of a redirect, or fails when the redirects do not end. The
 * redirect is dispatched as REDIRECT_ROUTE, and its failure too when the redirects never end.
 */
function redirect(
  context: PipelineContext,
  url: string,
  target: string,
  state: unknown,
  redirects: number,
  by: "route" | "guard",
): Outcome<Plan> {
  const payload = { url, target, by };
  if (redirects >= MAX_REDIRECTS) {
    const error = new NavigationFailedError(target, new Error(`More than ${MAX_REDIRECTS} redirects`));
    context.trace.failure("REDIRECT_ROUTE", payload, error);
    return Task.fail(error);
  }
  context.trace.success("REDIRECT_ROUTE", payload);
  return planAt(context, target, state, redirects + 1);
}

/**
 * The verdict of the guards of the matched routes, root first. Each route's guards run as one
 * GUARD_ROUTE action; the first route that does not say `true` decides, and the routes after it do
 * not run. A rejection fails that action.
 */
function runGuards(
  context: PipelineContext,
  navigation: Navigation,
  chain: readonly LevelMatch[],
): Outcome<true | string> {
  return chain.reduce<Outcome<true | string>>(
    (previous, level) =>
      Task.flatMap(previous, (verdict): Outcome<true | string> =>
        verdict === true
          ? guardRoute(context, navigation, level)
          : Task.succeed(verdict)),
    Task.succeed(true),
  );
}

/** The guards of one matched route, in order, as its GUARD_ROUTE action. */
function guardRoute(
  context: PipelineContext,
  navigation: Navigation,
  level: LevelMatch,
): Outcome<true | string> {
  const payload = { url: navigation.url, route: level.route.path };
  const decided = (level.route.canActivate ?? []).reduce<Outcome<GuardResult>>(
    (previous, guard) =>
      Task.flatMap(previous, (verdict): Outcome<GuardResult> =>
        verdict === true
          ? step(context.injector, navigation, () => guard(navigation))
          : Task.succeed(verdict)),
    Task.succeed(true),
  );
  const checked = Task.flatMap(decided, (verdict): Outcome<true | string> =>
    verdict === false
      ? Task.fail(new NavigationRejectedError(navigation.url))
      : Task.succeed(verdict));
  return context.trace.observe("GUARD_ROUTE", payload, checked, (verdict) => ({ ...payload, verdict }));
}

/**
 * One call of a guard, as a task: run in the injection context, and waited for when
 * it returns a task. A throw or a failing task fails the navigation with a NavigationFailedError.
 */
function step<T>(
  injector: Injector,
  navigation: Navigation,
  call: () => T | Task<T, unknown>,
): Outcome<T> {
  return Task.from<T, NavigationError>((ok, error) =>
    inContext(injector, call)
      .run({
        ok,
        error: (cause) => error(new NavigationFailedError(navigation.url, cause)),
      }));
}

/** Calls `fn` in the injection context of `injector`, and returns its value as a task. */
function inContext<T>(injector: Injector, fn: () => T | Task<T, unknown>): Task<T, unknown> {
  const produced = Task.from<T | Task<T, unknown>, unknown>((ok) =>
    ok(runInInjectionContext(injector, fn)));
  return Task.flatMap(produced, (value): Task<T, unknown> =>
    isTask(value) ? value : Task.succeed(value));
}

function isTask<T>(value: T | Task<T, unknown>): value is Task<T, unknown> {
  return value instanceof Task;
}

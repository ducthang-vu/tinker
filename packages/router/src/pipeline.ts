// The navigation pipeline: the work between a navigation's URL and its commit. Given a URL, it
// matches the URL, runs the guards of every matched route (root first, each route's in order) until
// one says something other than `true` (a chain of responsibility), and follows a redirect from the
// start. Its result is a Plan, which the router commits. The pipeline never touches the browser or
// the router's state: a failed plan changes nothing.
//
// Each step is a Task, so a guard may be asynchronous, and cancelling the Task stops the step that
// runs. A guard is called in the router's injection context, so it can `inject`.

import { Injector, runInInjectionContext, Task } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";
import { keptLevels } from "./activation.ts";
import {
  type GuardResult,
  type Navigation,
  type NavigationError,
  NavigationFailedError,
  NavigationRejectedError,
  NoRouteError,
} from "./navigation.ts";
import { type LevelMatch, matchChain, matchOf } from "./match.ts";
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
  if (chain === undefined) {
    return Task.fail(new NoRouteError(url));
  }
  const navigation: Navigation = {
    url,
    state,
    match: matchOf(chain),
    from: context.from,
  };
  const levels = chain.slice(1);
  const kept = keptLevels(context.activated, levels);
  return Task.flatMap(
    runRedirects(context.injector, navigation, chain),
    (target): Outcome<Plan> => {
      if (target !== undefined) {
        return redirect(context, target, state, redirects);
      }
      return Task.flatMap(
        runGuards(context.injector, navigation, chain),
        (verdict): Outcome<Plan> => {
          if (verdict === false) {
            return Task.fail(new NavigationRejectedError(url));
          }
          if (typeof verdict === "string") {
            return redirect(context, verdict, state, redirects);
          }
          return Task.succeed({ url, state, chain, kept });
        },
      );
    },
  );
}

/**
 * The URL the redirects of the matched levels send the navigation to, root first: the first
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

/** Plans the navigation to the target of a redirect, or fails when the redirects do not end. */
function redirect(
  context: PipelineContext,
  target: string,
  state: unknown,
  redirects: number,
): Outcome<Plan> {
  if (redirects >= MAX_REDIRECTS) {
    return Task.fail(
      new NavigationFailedError(target, new Error(`More than ${MAX_REDIRECTS} redirects`)),
    );
  }
  return planAt(context, target, state, redirects + 1);
}

/**
 * The guards of the matched levels, in order, run until one does not say `true`: that verdict is
 * the outcome. With every guard saying `true`, the outcome is `true`.
 */
function runGuards(
  injector: Injector,
  navigation: Navigation,
  chain: readonly LevelMatch[],
): Outcome<GuardResult> {
  const guards = chain.flatMap((level) => level.route.canActivate ?? []);
  return guards.reduce<Outcome<GuardResult>>(
    (previous, guard) =>
      Task.flatMap(previous, (verdict): Outcome<GuardResult> =>
        verdict === true
          ? step(injector, navigation, () => guard(navigation))
          : Task.succeed(verdict)),
    Task.succeed(true),
  );
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

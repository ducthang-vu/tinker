// The vocabulary of the navigation pipeline: what a guard receives and returns, and the ways a
// navigation can end without reaching its URL. A navigation matches its URL, runs the guards of the
// matched routes, follows redirects, and only then commits (see pipeline.ts). Until it commits,
// nothing in the browser or the router has changed.

import type { Either, Task } from "@tinker/core";
import type { RouteMatch } from "./match.ts";

/** What a guard is told about the navigation it runs for. */
export interface Navigation {
  /** The URL being checked. After a redirect, the guards run again for the target. */
  readonly url: string;
  /** The state the history entry is given, `null` when none is given. */
  readonly state: unknown;
  /** The leaf route the URL matches, and the params it read. */
  readonly match: RouteMatch;
  /** The URL the router was at before this navigation, or `""` before the first one. */
  readonly from: string;
}

/**
 * What a guard decides. `true` lets the navigation go on, `false` rejects it, and a string
 * redirects it: the URL is checked again from the start, as if it had been asked for.
 */
export type GuardResult = boolean | string;

/**
 * A guard of a route, run before the navigation commits. It returns its decision, or a `Task` of it
 * for a decision that takes time (a fetch, say). It runs in the injection context of the router, so
 * it can call `inject`. A throw, or a failing task, fails the navigation with a
 * `NavigationFailedError`.
 */
export type Guard = (navigation: Navigation) => GuardResult | Task<GuardResult, unknown>;

/** A URL no route matches. The URL does not change. */
export class NoRouteError extends Error {
  constructor(readonly url: string) {
    super(`Cannot match any route: ${url}`);
    this.name = "NoRouteError";
  }
}

/** A guard said `false`. The URL does not change. */
export class NavigationRejectedError extends Error {
  constructor(readonly url: string) {
    super(`Navigation rejected by a guard: ${url}`);
    this.name = "NavigationRejectedError";
  }
}

/** A newer navigation started before this one committed. The URL does not change for this one. */
export class NavigationCancelledError extends Error {
  constructor(readonly url: string) {
    super(`Navigation cancelled by a newer one: ${url}`);
    this.name = "NavigationCancelledError";
  }
}

/**
 * A guard failed (threw, or its task failed), or the redirects did not end. The
 * failure that caused it is its `cause`.
 */
export class NavigationFailedError extends Error {
  constructor(readonly url: string, cause: unknown) {
    super(`Navigation failed: ${url}`, { cause });
    this.name = "NavigationFailedError";
  }
}

/** The ways a navigation can fail without committing. */
export type NavigationError
  = | NoRouteError
    | NavigationRejectedError
    | NavigationCancelledError
    | NavigationFailedError;

/**
 * The result of a navigation: right when it committed, left with the error that stopped it. An
 * `Error` that is not a navigation error can only come from a bug in the router itself.
 */
export type NavigationResult = Either<NavigationError | Error, void>;

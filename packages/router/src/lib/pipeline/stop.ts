// The stops of the pipeline: the left side before a navigation commits. A redirect is a stop too,
// but it is not a final result: the router turns it into a new request. Every other stop is a
// Rejected, which carries the navigation it belongs to.

import type { Destination } from "../destination/url-builder.ts";
import type { NavigationRef, Rejected } from "./navigation-outcome.ts";

/** A route or a guard sends the navigation to `target` instead. Internal: not a final result. */
export class Redirect {
  /** Only `of` makes one. */
  /**
   *
   * @param navigation
   * @param target
   */
  private constructor(
    readonly navigation: NavigationRef,
    readonly target: Destination,
  ) {}

  /**
   * A redirect of `navigation` to `target`.
   *
   * @param navigation The navigation being redirected.
   * @param target The destination it goes to instead, built by the URL builder.
   * @returns A Redirect.
   */
  static of(navigation: NavigationRef, target: Destination): Redirect {
    return new Redirect(navigation, target);
  }
}

/** Why the pipeline stopped: a redirect to follow, or a rejection that ends the navigation. */
export type Stop = Redirect | Rejected;

/**
 * A rejection for a URL no route matches.
 *
 * @param navigation The navigation that matched no route.
 * @returns A no-route rejection.
 */
export function noRoute(navigation: NavigationRef): Rejected {
  return { kind: "rejected", reason: "no-route", navigation };
}

/**
 * A rejection by a guard.
 *
 * @param navigation The navigation the guard rejected.
 * @param route The path of the route whose guard said no.
 * @returns A guard rejection.
 */
export function guardRejected(navigation: NavigationRef, route: string): Rejected {
  return { kind: "rejected", reason: "guard", navigation, route };
}

/**
 * A rejection because a step failed.
 *
 * @param navigation The navigation whose step failed.
 * @param cause What went wrong.
 * @returns A failure rejection.
 */
export function failed(navigation: NavigationRef, cause: unknown): Rejected {
  return { kind: "rejected", reason: "failed", navigation, cause };
}

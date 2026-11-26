// The final results of a navigation. Done is the right path. Cancelled and Rejected are the left
// side: each carries the navigation it belongs to, and what went wrong.

import type { AppPath } from "../destination/app-path.ts";
import type { StopCommand } from "./guard-step.ts";
import type { MatchedRequest } from "./request.ts";

/** The navigation as the router knows it: enough to say which one an outcome is about. */
export interface NavigationRef {
  /** The id of the navigation. */
  readonly id: number;
  /** The destination the navigation goes to. */
  readonly destination: AppPath;
  /** What each step did to the navigation, in order. For debugging. */
  readonly trace: readonly unknown[];
}

/** The navigation committed. Its object is the one that came out of the guards, unchanged. */
export interface Done {
  /** The outcome kind: the navigation committed. */
  readonly kind: "done";
  /** The navigation, as it came out of the guards. */
  readonly navigation: MatchedRequest;
  /** What each step did to the navigation, in order. For debugging. */
  readonly meta: readonly unknown[];
}

/** A newer navigation replaced this one before it committed. */
export interface Cancelled {
  /** The outcome kind: the navigation was cancelled. */
  readonly kind: "cancelled";
  /** The navigation that was replaced. */
  readonly navigation: NavigationRef;
  /** The id of the newer navigation. */
  readonly by: number;
  /** What each step did to the navigation, in order. For debugging. */
  readonly meta: readonly unknown[];
}

/**
 * Where a rejected navigation stopped: the pipeline step that produced the rejection.
 * `DEACTIVATE_GUARD` and `ACTIVATE_GUARD` tell a guard of a route being left from a guard of a
 * route being entered.
 */
export type RejectionSource = "MATCH" | "REDIRECT" | "DEACTIVATE_GUARD" | "ACTIVATE_GUARD" | "COMMIT";

/** The navigation stopped before it committed, and changed nothing. */
export type Rejected
  = | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: no route matches the destination. */
    readonly reason: "no-route";
    /** The step that stopped it: always MATCH. */
    readonly source: RejectionSource;
    /** The navigation that matched no route. */
    readonly navigation: NavigationRef;
    /** What each step did to the navigation, in order. For debugging. */
    readonly meta: readonly unknown[];
  }
  | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: a guard said no. */
    readonly reason: "guard";
    /** The step whose guard said no: DEACTIVATE_GUARD or ACTIVATE_GUARD. */
    readonly source: RejectionSource;
    /** The navigation the guard rejected. */
    readonly navigation: NavigationRef;
    /** The path of the route whose guard said no. */
    readonly route: string;
    /** The STOP command the guard returned. Its payload has the reason the guard gave. */
    readonly guard: StopCommand;
    /** What each step did to the navigation, in order. For debugging. */
    readonly meta: readonly unknown[];
  }
  | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: a step failed. */
    readonly reason: "failed";
    /** The step that failed. */
    readonly source: RejectionSource;
    /** The navigation whose step failed. */
    readonly navigation: NavigationRef;
    /** What went wrong. */
    readonly cause: unknown;
    /** What each step did to the navigation, in order. For debugging. */
    readonly meta: readonly unknown[];
  };

/** Every final result of a navigation. */
export type NavigationOutcome = Done | Cancelled | Rejected;

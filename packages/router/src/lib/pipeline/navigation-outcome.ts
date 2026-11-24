// The final results of a navigation. Done is the right path. Cancelled and Rejected are the left
// side: each carries the navigation it belongs to, and what went wrong.

import type { Destination } from "../destination/destination.ts";
import type { MatchedRequest } from "./request.ts";

/** The navigation as the router knows it: enough to say which one an outcome is about. */
export interface NavigationRef {
  /** The id of the navigation. */
  readonly id: number;
  /** The destination the navigation goes to. */
  readonly destination: Destination;
}

/** The navigation committed. Its object is the one that came out of the guards, unchanged. */
export interface Done {
  /** The outcome kind: the navigation committed. */
  readonly kind: "done";
  /** The navigation, as it came out of the guards. */
  readonly navigation: MatchedRequest;
}

/** A newer navigation replaced this one before it committed. */
export interface Cancelled {
  /** The outcome kind: the navigation was cancelled. */
  readonly kind: "cancelled";
  /** The navigation that was replaced. */
  readonly navigation: NavigationRef;
  /** The id of the newer navigation. */
  readonly by: number;
}

/** The navigation stopped before it committed, and changed nothing. */
export type Rejected
  = | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: no route matches the destination. */
    readonly reason: "no-route";
    /** The navigation that matched no route. */
    readonly navigation: NavigationRef;
  }
  | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: a guard said no. */
    readonly reason: "guard";
    /** The navigation the guard rejected. */
    readonly navigation: NavigationRef;
    /** The path of the route whose guard said no. */
    readonly route: string;
  }
  | {
    /** The outcome kind: the navigation was rejected. */
    readonly kind: "rejected";
    /** Why: a step failed. */
    readonly reason: "failed";
    /** The navigation whose step failed. */
    readonly navigation: NavigationRef;
    /** What went wrong. */
    readonly cause: unknown;
  };

/** Every final result of a navigation. */
export type NavigationOutcome = Done | Cancelled | Rejected;

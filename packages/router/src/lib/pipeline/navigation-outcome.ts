// The final results of a navigation. Done is the right path. Cancelled and Rejected are the left
// side: each carries the navigation it belongs to, and what went wrong.

import type { MatchedRequest } from "./request.ts";

/** The navigation as the router knows it: enough to say which one an outcome is about. */
export interface NavigationRef {
  readonly id: number;
  readonly url: string;
}

/** The navigation committed. Its object is the one that came out of the guards, unchanged. */
export interface Done {
  readonly kind: "done";
  readonly navigation: MatchedRequest;
}

/** A newer navigation replaced this one before it committed. */
export interface Cancelled {
  readonly kind: "cancelled";
  readonly navigation: NavigationRef;
  /** The id of the newer navigation. */
  readonly by: number;
}

/** The navigation stopped before it committed, and changed nothing. */
export type Rejected
  = | { readonly kind: "rejected"; readonly reason: "no-route"; readonly navigation: NavigationRef }
    | {
      readonly kind: "rejected";
      readonly reason: "guard";
      readonly navigation: NavigationRef;
      /** The path of the route whose guard said no. */
      readonly route: string;
    }
    | {
      readonly kind: "rejected";
      readonly reason: "failed";
      readonly navigation: NavigationRef;
      readonly cause: unknown;
    };

/** Every final result of a navigation. */
export type NavigationOutcome = Done | Cancelled | Rejected;

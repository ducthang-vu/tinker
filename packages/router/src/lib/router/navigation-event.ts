// The navigation events the router publishes. A navigation publishes STARTED when the pipeline
// starts it, and one final event when its outcome is known: DONE, CANCELLED, or REJECTED. Each
// event is an object with a `type` and a `payload`, the same shape as the guards' commands.

import type { Cancelled, Done, NavigationOutcome, Rejected } from "../pipeline/navigation-outcome.ts";
import type { NavigationRequest } from "../pipeline/request.ts";

/** A navigation has started: the pipeline is about to run it. */
export interface NavigationStarted {
  /** The event type. */
  readonly type: "STARTED";
  /** The request the pipeline starts with, with the routes it leaves. */
  readonly payload: NavigationRequest;
}

/** A navigation committed. */
export interface NavigationDone {
  /** The event type. */
  readonly type: "DONE";
  /** The committed navigation. */
  readonly payload: Done;
}

/** A navigation was replaced by a newer one before it committed. */
export interface NavigationCancelled {
  /** The event type. */
  readonly type: "CANCELLED";
  /** The cancelled navigation. */
  readonly payload: Cancelled;
}

/** A navigation was rejected: a guard stopped it, no route takes it, or a step failed. */
export interface NavigationRejected {
  /** The event type. */
  readonly type: "REJECTED";
  /** The rejection, with its reason. */
  readonly payload: Rejected;
}

/** A navigation event: the start, or the one final event of the outcome. */
export type NavigationEvent
  = | NavigationStarted
    | NavigationDone
    | NavigationCancelled
    | NavigationRejected;

/**
 * The final event of a navigation: the outcome, as one of the three final event types.
 *
 * @param outcome The outcome the navigation settled with.
 * @returns The event of that outcome.
 */
export function finalEventOf(
  outcome: NavigationOutcome,
): NavigationDone | NavigationCancelled | NavigationRejected {
  switch (outcome.kind) {
    case "done":
      return { type: "DONE", payload: outcome };
    case "cancelled":
      return { type: "CANCELLED", payload: outcome };
    case "rejected":
      return { type: "REJECTED", payload: outcome };
  }
}

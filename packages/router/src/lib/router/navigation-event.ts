// The navigation events the router publishes. A navigation publishes STARTED when the pipeline
// starts it, and one final event when its outcome is known: DONE, CANCELLED, or REJECTED. Each
// event is an object with a `type` and a `payload`, the same shape as the guards' commands.

import type {
  Cancelled,
  Done,
  NavigationOutcome,
  Rejected,
  RejectionSource,
} from "../pipeline/navigation-outcome.ts";
import type { NavigationRequest } from "../pipeline/request.ts";

/** A navigation has started: the pipeline is about to run it. */
export interface NavigationStarted {
  /** The event type. */
  readonly type: "STARTED";
  /** What produced the event: the start of the navigation. */
  readonly source: "START";
  /** The request the pipeline starts with, with the routes it leaves. */
  readonly payload: NavigationRequest;
}

/** A navigation committed. */
export interface NavigationDone {
  /** The event type. */
  readonly type: "DONE";
  /** What produced the event: the commit step. */
  readonly source: "COMMIT";
  /** The committed navigation. */
  readonly payload: Done;
}

/** A navigation was replaced by a newer one before it committed. */
export interface NavigationCancelled {
  /** The event type. */
  readonly type: "CANCELLED";
  /** What produced the event: a newer navigation, which replaced this one. */
  readonly source: "NEW_NAVIGATION";
  /** The cancelled navigation. */
  readonly payload: Cancelled;
}

/** A navigation was rejected: a guard stopped it, no route takes it, or a step failed. */
export interface NavigationRejected {
  /** The event type. */
  readonly type: "REJECTED";
  /** What produced the event: the step that stopped the navigation. */
  readonly source: RejectionSource;
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
      return { type: "DONE", source: "COMMIT", payload: outcome };
    case "cancelled":
      return { type: "CANCELLED", source: "NEW_NAVIGATION", payload: outcome };
    case "rejected":
      return { type: "REJECTED", source: outcome.source, payload: outcome };
  }
}

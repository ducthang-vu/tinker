// The interface of each step of the pipeline. A step is a function: the pipeline is built from
// these four, in order, and any of them can be replaced (in a test, say) without changing the rest.
//
//   match     Either  Does a route match the URL? Stops with NoRoute, or Failed when
//                     redirectFrom is past the cap.
//   redirect  Either  Does a route send the navigation elsewhere? Stops with Redirect.
//   guards    Task    Do the guards of the matched routes allow it? Stops with Rejected,
//                     Redirect, or Failed. A guard may wait, so the step is a Task.
//   commit    Task    Commit the navigation: change the browser when the URL needs it, then
//                     activate the routes. Stops with Failed when the browser refuses.

import type { Either, Task } from "@tinker/functional";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { Stop } from "./stop.ts";

/** Matches the request's URL against the route tree. Pure. */
export type MatchStep = (request: NavigationRequest) => Either<MatchedRequest, Stop>;

/** Asks the matched routes whether to redirect. Pure. */
export type RedirectStep = (matched: MatchedRequest) => Either<MatchedRequest, Stop>;

/** Runs the matched routes' guards. Allows the navigation by succeeding with it. */
/** Runs the deactivate guards of the routes the navigation leaves, from the last to the first. */
export type DeactivateStep = (matched: MatchedRequest) => Task<MatchedRequest, Stop>;

/** Runs the activate guards of the matched routes, root first. */
export type GuardStep = (matched: MatchedRequest) => Task<MatchedRequest, Stop>;

/**
 * Commits the navigation. A push adds a history entry. A pop changes the browser only when a
 * redirect moved the URL. Then the activated routes are updated. Succeeds with the navigation once
 * it is committed.
 */
export type CommitStep = (matched: MatchedRequest) => Task<MatchedRequest, Stop>;

/** The four steps the pipeline is built from. */
export interface PipelineSteps {
  /** The step that matches the request's destination against the tree. */
  readonly match: MatchStep;
  /** The step that asks the matched routes whether to redirect. */
  readonly redirect: RedirectStep;
  /** The step that runs the matched routes' guards. */
  readonly deactivate: DeactivateStep;
  /** The step that runs the matched routes' activate guards. */
  readonly guards: GuardStep;
  /** The step that commits the navigation: the browser, then the routes. */
  readonly commit: CommitStep;
}

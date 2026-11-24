// The redirect driver: runs the pipeline for a request, and follows each redirect as a new request.
// A redirect keeps the navigation's id, moves the destination to the redirect's target, and appends
// the URL it came from to `redirectFrom`, so the match step can cap the chain. Every other stop ends
// the navigation as a Rejected. The driver is one Task, so cancelling it cancels the redirect chain.

import { Stream, fail, flatMap, match, run, succeed, Left, Right, type Either, type Task } from "@tinker/functional";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { Rejected } from "./navigation-outcome.ts";
import { Redirect, type Stop } from "./stop.ts";

/**
 * Runs the pipeline's task for a request, and hands its result over as a value: a Right with the
 * matched request, or a Left with the stop. The task then never fails, so the driver can branch on
 * the stop. A cancel reaches the pipeline's task.
 *
 * @param task The pipeline's task for the request.
 * @returns A task of the result, which never fails.
 */
function settled(task: Task<MatchedRequest, Stop>): Task<Either<MatchedRequest, Stop>, never> {
  return Stream.from<never, Either<MatchedRequest, Stop>, never>((sink) =>
    run(task, {
      ok: (matched) => sink.end(Right.of<Either<MatchedRequest, Stop>, never>(Right.of(matched))),
      error: (stop) => sink.end(Right.of<Either<MatchedRequest, Stop>, never>(Left.of(stop))),
    }));
}

/**
 * The request a redirect asks for: the same navigation, to the redirect's target.
 *
 * @param request The request that was redirected.
 * @param redirect The redirect stop it produced.
 * @returns The next request, with the redirected URL appended to `redirectFrom`.
 */
function redirected(request: NavigationRequest, redirect: Redirect): NavigationRequest {
  return {
    ...request,
    destination: redirect.target,
    redirectFrom: [...request.redirectFrom, request.destination],
  };
}

/**
 * Runs the navigation for `request`, following its redirects, until it commits or is rejected.
 *
 * @param pipeline The pipeline, a function from a request to the task that runs it.
 * @param request The first request of the navigation.
 * @returns A task of the committed request, or the Rejected that stopped the navigation.
 */
export function follow(
  pipeline: (request: NavigationRequest) => Task<MatchedRequest, Stop>,
  request: NavigationRequest,
): Task<MatchedRequest, Rejected> {
  return flatMap(settled(pipeline(request)), (result) =>
    match<MatchedRequest, Stop, Task<MatchedRequest, Rejected>>(result, {
      Right: (matched) => succeed(matched),
      Left: (stop) => stop instanceof Redirect
        ? follow(pipeline, redirected(request, stop))
        : fail(stop),
    }));
}

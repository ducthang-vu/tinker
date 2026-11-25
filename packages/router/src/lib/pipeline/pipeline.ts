// The pipeline: the five steps in order, as one function from a request to a task. Nothing runs
// until the task is run; that includes the pure steps, which run inside the task's first step. A
// stop in any step ends the pipeline with that stop, and the steps after it do not run.

import { createTask, flatMap, pipe, succeed, type Task } from "@tinker/functional";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import type { PipelineSteps } from "./steps.ts";
import type { Stop } from "./stop.ts";

/**
 * Builds the pipeline from its steps.
 *
 * @param steps The five steps, in order: match, redirect, deactivate, guards, commit.
 * @returns A function from a request to the task that runs it.
 */
export function createPipeline(
  steps: PipelineSteps,
): (request: NavigationRequest) => Task<MatchedRequest, Stop> {
  return (request) =>
    pipe(
      succeed(request),
      flatMap((r: NavigationRequest) => createTask(steps.match(r))),
      flatMap((m: MatchedRequest) => createTask(steps.redirect(m))),
      flatMap(steps.deactivate),
      flatMap(steps.guards),
      flatMap(steps.commit),
    );
}

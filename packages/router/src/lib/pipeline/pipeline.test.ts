import { describe, expect, test } from "vitest";
import { createTask, Left, Right, run, fail, succeed, type Either, type Task } from "@tinker/functional";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import { createPipeline } from "./pipeline.ts";
import type { PipelineSteps } from "./steps.ts";
import { Failed, NoRoute, Rejected, Redirect, type Stop } from "./stop.ts";

const request: NavigationRequest = {
  id: 1,
  url: "/todos/7",
  state: null,
  arrival: "push",
  redirectFrom: [],
};

/**
 * Steps that pass the request through, each recording its name in `log`. A test replaces the step
 * it is about.
 */
function fakeSteps(log: string[], overrides: Partial<PipelineSteps> = {}): PipelineSteps {
  return {
    match: (r) => {
      log.push("match");
      return Right.of<MatchedRequest, Stop>({ ...r, chain: [] });
    },
    redirect: (m) => {
      log.push("redirect");
      return Right.of<MatchedRequest, Stop>(m);
    },
    guards: (m) => {
      log.push("guards");
      return succeed(m);
    },
    commit: (m) => {
      log.push("commit");
      return succeed(m);
    },
    ...overrides,
  };
}

/** The outcome of a task run to its end: its success, or its stop. */
function outcomeOf(task: Task<MatchedRequest, Stop>): { ok?: MatchedRequest; error?: Stop } {
  const seen: { ok?: MatchedRequest; error?: Stop }[] = [];
  run(task, {
    ok: (value) => {
      seen.push({ ok: value });
    },
    error: (error) => {
      seen.push({ error });
    },
  });
  return seen[0] ?? {};
}

describe("the pipeline's order", () => {
  test("runs match, redirect, guards and commit in order, and succeeds with the matched request", () => {
    const log: string[] = [];
    const outcome = outcomeOf(createPipeline(fakeSteps(log))(request));
    expect(log)
      .toEqual(["match", "redirect", "guards", "commit"]);
    expect(outcome.ok?.url)
      .toBe("/todos/7");
  });

  test("building the pipeline runs no step: nothing happens until the task is run", () => {
    const log: string[] = [];
    const task = createPipeline(fakeSteps(log))(request);
    expect(log)
      .toEqual([]);
    outcomeOf(task);
    expect(log)
      .toHaveLength(4);
  });

  test("each step receives the result of the step before it", () => {
    const seen: number[] = [];
    const steps = fakeSteps([], {
      match: (r) => Right.of<MatchedRequest, Stop>({ ...r, chain: [], redirectFrom: ["/home"] }),
      guards: (m) => {
        seen.push(m.redirectFrom.length);
        return succeed(m);
      },
    });
    outcomeOf(createPipeline(steps)(request));
    expect(seen)
      .toEqual([1]);
  });
});

describe("stops", () => {
  test("no route stops at match: the later steps do not run", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      match: () => Left.of<Stop, MatchedRequest>(NoRoute.of("/nowhere")),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(log)
      .toEqual([]);
    expect(outcome.error)
      .toBeInstanceOf(NoRoute);
  });

  test("a redirect stops at redirect: guards and commit do not run", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      redirect: () => Left.of<Stop, MatchedRequest>(Redirect.of("/login")),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(log)
      .toEqual(["match"]);
    expect(outcome.error)
      .toBeInstanceOf(Redirect);
  });

  test("a rejection from the guards stops before the commit", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      guards: (m) => fail<Stop>(Rejected.of(m.url)),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(log)
      .toEqual(["match", "redirect"]);
    expect(outcome.error)
      .toBeInstanceOf(Rejected);
  });

  test("a failure in the commit step is the pipeline's failure", () => {
    const cause = new Error("refused");
    const steps = fakeSteps([], {
      commit: (m) => fail<Stop>(Failed.of(m.url, cause)),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(outcome.error)
      .toBeInstanceOf(Failed);
  });

  test("a navigation past the redirect cap stops at match, before anything else", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      match: (r) => Left.of<Stop, MatchedRequest>(Failed.of(r.url, new Error("too many redirects"))),
    });
    const outcome = outcomeOf(createPipeline(steps)({ ...request, redirectFrom: Array.from({ length: 11 }, () => "/x") }));
    expect(log)
      .toEqual([]);
    expect(outcome.error)
      .toBeInstanceOf(Failed);
  });
});

describe("types", () => {
  test("a step that is a Task is run by the pipeline in the same chain as an Either step", () => {
    const direct: Either<MatchedRequest, Stop> = Right.of<MatchedRequest, Stop>({
      ...request,
      chain: [],
    });
    const lifted: Task<MatchedRequest, Stop> = createTask(direct);
    expect(outcomeOf(lifted).ok?.url)
      .toBe("/todos/7");
  });
});

import { describe, expect, test } from "vitest";
import { type AppPath, type Segment, makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";
import { createTask, Left, Right, run, fail, succeed, type Either, type Task } from "@tinker/functional";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import { createPipeline } from "./pipeline.ts";
import type { PipelineSteps } from "./steps.ts";
import { failed, guardRejected, noRoute, Redirect, type Stop } from "./stop.ts";

/** A destination of literal segments for a path such as "/todos/7". */
function destinationOf(path: string): AppPath {
  return makeAppPath(
    path.split("/")
      .filter((segment) => segment !== "")
      .map((value): Segment => ({ kind: "segment", value })),
    {},
    undefined,
  );
}

const targets = [{ path: "/login" }, { path: "/home" }, { path: "/elsewhere" }] as const;

/** A destination for one of the targets above, built by the URL builder. */
function to(path: "login" | "home" | "elsewhere") {
  return builderOver(targets)
    .to(path)
    .build();
}

const ref = { id: 1, destination: destinationOf("/todos/7") };

const request: NavigationRequest = {
  id: 1,
  destination: destinationOf("/todos/7"),
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
    expect(outcome.ok?.destination.format())
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
      match: (r) => Right.of<MatchedRequest, Stop>({ ...r, chain: [], redirectFrom: [destinationOf("/home")] }),
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
      match: () => Left.of<Stop, MatchedRequest>(noRoute(ref)),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(log)
      .toEqual([]);
    expect(outcome.error)
      .toMatchObject({ kind: "rejected", reason: "no-route" });
  });

  test("a redirect stops at redirect: guards and commit do not run", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      redirect: () => Left.of<Stop, MatchedRequest>(Redirect.of(ref, to("login"))),
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
      guards: () => fail<Stop>(guardRejected(ref, "/todos")),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(log)
      .toEqual(["match", "redirect"]);
    expect(outcome.error)
      .toMatchObject({ kind: "rejected", reason: "guard" });
  });

  test("a failure in the commit step is the pipeline's failure", () => {
    const cause = new Error("refused");
    const steps = fakeSteps([], {
      commit: () => fail<Stop>(failed(ref, cause)),
    });
    const outcome = outcomeOf(createPipeline(steps)(request));
    expect(outcome.error)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a navigation past the redirect cap stops at match, before anything else", () => {
    const log: string[] = [];
    const steps = fakeSteps(log, {
      match: () => Left.of<Stop, MatchedRequest>(failed(ref, new Error("too many redirects"))),
    });
    const outcome = outcomeOf(createPipeline(steps)({ ...request, redirectFrom: Array.from({ length: 11 }, () => destinationOf("/x")) }));
    expect(log)
      .toEqual([]);
    expect(outcome.error)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });
});

describe("types", () => {
  test("a step that is a Task is run by the pipeline in the same chain as an Either step", () => {
    const direct: Either<MatchedRequest, Stop> = Right.of<MatchedRequest, Stop>({
      ...request,
      chain: [],
    });
    const lifted: Task<MatchedRequest, Stop> = createTask(direct);
    expect(outcomeOf(lifted).ok?.destination.format())
      .toBe("/todos/7");
  });
});

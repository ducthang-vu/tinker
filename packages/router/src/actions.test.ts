import { describe, expect, test } from "vitest";
import { Task } from "@tinker/core";
import { type NavigationAction, NavigationTrace } from "./actions.ts";

/** A trace of navigation `id` that records what it dispatches. */
function recordingTrace(id = 1) {
  const dispatched: NavigationAction[] = [];
  const trace = NavigationTrace.of(id, (action) => {
    dispatched.push(action);
  });
  return { trace, dispatched };
}

/** The outcome of a task that settles as soon as it runs, if it does. */
type Settled<T, E> = { readonly ok: T } | { readonly error: E };

function settledNow<T, E>(task: Task<T, E>): Settled<T, E> | undefined {
  const seen: Settled<T, E>[] = [];
  task.run({
    ok: (value) => seen.push({ ok: value }),
    error: (error) => seen.push({ error }),
  });
  return seen[0];
}

describe("numbering", () => {
  test("a success is dispatched with its navigation id and sequence 1", () => {
    const { trace, dispatched } = recordingTrace(7);
    trace.success("MATCH_ROUTE", { url: "/todos" });
    expect(dispatched)
      .toEqual([
        {
          type: "MATCH_ROUTE",
          navigationId: 7,
          sequence: 1,
          payload: { url: "/todos" },
          status: "success",
        },
      ]);
  });

  test("the sequence counts every action of the navigation, successes and failures alike", () => {
    const { trace, dispatched } = recordingTrace();
    trace.success("NAVIGATION_START", { url: "/a", state: null, arrival: "push" });
    trace.failure("MATCH_ROUTE", { url: "/a" }, new Error("no route"));
    trace.success("NAVIGATION_END", { url: "/a" });
    expect(dispatched.map((action) => action.sequence))
      .toEqual([1, 2, 3]);
  });

  test("two navigations number their actions separately, each from 1", () => {
    const first = recordingTrace(1);
    const second = recordingTrace(2);
    first.trace.success("MATCH_ROUTE", { url: "/a" });
    second.trace.success("MATCH_ROUTE", { url: "/b" });
    first.trace.success("NAVIGATION_END", { url: "/a" });
    expect(first.dispatched.map((action) => [action.navigationId, action.sequence]))
      .toEqual([[1, 1], [1, 2]]);
    expect(second.dispatched.map((action) => [action.navigationId, action.sequence]))
      .toEqual([[2, 1]]);
  });

  test("the trace knows its navigation id", () => {
    expect(recordingTrace(4).trace.id)
      .toBe(4);
  });
});

describe("failures", () => {
  test("a failure is dispatched as the action that failed, with its payload and error", () => {
    const { trace, dispatched } = recordingTrace();
    const error = new Error("guard threw");
    trace.failure("GUARD_ROUTE", { url: "/todos", route: "/todos" }, error);
    expect(dispatched)
      .toEqual([
        {
          type: "GUARD_ROUTE",
          navigationId: 1,
          sequence: 1,
          payload: { url: "/todos", route: "/todos" },
          status: "error",
          error,
        },
      ]);
  });
});

describe("observe", () => {
  test("a task that succeeds dispatches a success with the payload, and passes its value on", () => {
    const { trace, dispatched } = recordingTrace();
    const outcome = settledNow(trace.observe("MATCH_ROUTE", { url: "/a" }, Task.succeed(3)));
    expect(outcome)
      .toEqual({ ok: 3 });
    expect(dispatched.map((action) => [action.type, action.status]))
      .toEqual([["MATCH_ROUTE", "success"]]);
  });

  test("onSuccess builds the success payload from the value", () => {
    const { trace, dispatched } = recordingTrace();
    trace.observe(
      "GUARD_ROUTE",
      { url: "/todos", route: "/todos" },
      Task.succeed<true | string>(true),
      (verdict) => ({ url: "/todos", route: "/todos", verdict }),
    )
      .run({});
    expect(dispatched[0])
      .toMatchObject({ status: "success", payload: { url: "/todos", route: "/todos", verdict: true } });
  });

  test("a task that fails dispatches a failure with the payload, and passes the error on", () => {
    const { trace, dispatched } = recordingTrace();
    const error = new Error("refused");
    const outcome = settledNow(trace.observe("BROWSER_NAVIGATION", { url: "/a", state: null, step: "push" }, Task.fail(error)));
    expect(outcome)
      .toEqual({ error });
    expect(dispatched)
      .toMatchObject([{ type: "BROWSER_NAVIGATION", status: "error", error, payload: { step: "push" } }]);
  });

  test("the task runs only when it is run, and dispatches once", () => {
    const { trace, dispatched } = recordingTrace();
    const observed = trace.observe("MATCH_ROUTE", { url: "/a" }, Task.succeed(1));
    expect(dispatched)
      .toEqual([]);
    observed.run({});
    expect(dispatched)
      .toHaveLength(1);
  });
});

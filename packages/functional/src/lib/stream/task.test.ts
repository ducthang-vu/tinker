import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flatMap, map } from "../functor/functor.ts";
import { Left, Right } from "../monad/either.ts";
import { match } from "../monad/monad.ts";
import { type Cancel, run, Stream, subscribe } from "./stream.ts";
import {
  delay,
  fail,
  fromComputation,
  fromPromise,
  succeed,
  type Task,
  timeout,
  TimeoutError,
  toPromise,
} from "./task.ts";

/** Run a task and record what happens (synchronously, or after timers/promises). */
function record<T, E>(task: Task<T, E>) {
  const log: unknown[] = [];
  const cancel: Cancel = run(task, {
    ok: (v) => log.push(["ok", v]),
    error: (e) => log.push(["error", e]),
  });
  return { log, cancel };
}

/**
 * The Error a task failed with, as plain data: whatever was thrown becomes an Error carrying it
 * as its `cause`.
 */
function failure(log: unknown[]) {
  const [kind, error] = log[0] as [string, Error];
  expect(kind)
    .toBe("error");
  expect(error)
    .toBeInstanceOf(Error);
  return { message: error.message, cause: error.cause };
}

describe("Task", () => {
  test("is lazy: nothing happens until run", () => {
    let started = 0;
    const task = fromComputation<number>((ok) => (started++, ok(1)));
    expect(started)
      .toBe(0);
    expect(record(task).log)
      .toEqual([["ok", 1]]);
    expect(record(task).log)
      .toEqual([["ok", 1]]); // can run again
    expect(started)
      .toBe(2);
  });

  test("succeed succeeds, fail fails, and a throwing computation fails", () => {
    expect(record(succeed(1)).log)
      .toEqual([["ok", 1]]);
    expect(record(fail("bad")).log)
      .toEqual([["error", "bad"]]);
    const throwing = fromComputation(() => {
      throw "thrown";
    });
    expect(failure(record(throwing).log))
      .toEqual({ message: "thrown", cause: "thrown" });
  });

  test("calls one handler, once", () => {
    const task = fromComputation<number>((ok, error) => {
      ok(1);
      ok(2);
      error(new Error("late"));
    });
    expect(record(task).log)
      .toEqual([["ok", 1]]);
  });

  test("an error thrown by an ok handler is not swallowed either", () => {
    expect(() => run(succeed(1), { ok: () => {
      throw new Error("in handler");
    } }))
      .toThrow("in handler");
  });

  test("without an error handler, an error is re-thrown", () => {
    expect(() => run(fail("bad")))
      .toThrow();
    expect(() => run(fail(new Error("bad")), { ok: () => {} }))
      .toThrow("bad");
    expect(() => run(succeed(1)))
      .not.toThrow();
  });

  test("map transforms the result; an error in f fails the task", () => {
    expect(record(map(succeed(2), (n) => n * 10)).log)
      .toEqual([["ok", 20]]);
    expect(record(map(fail("e"), (n: number) => n * 10)).log)
      .toEqual([["error", "e"]]);
    expect(failure(record(map(succeed(2), () => {
      throw "in f";
    })).log))
      .toEqual({ message: "in f", cause: "in f" });
  });

  test("flatMap chains tasks; errors anywhere fail the whole", () => {
    expect(record(flatMap(succeed(2), (n) => succeed(n + 1))).log)
      .toEqual([["ok", 3]]);
    expect(record(flatMap(fail("first"), (n: number) => succeed(n))).log)
      .toEqual([["error", "first"]]);
    expect(record(flatMap(succeed(2), () => fail("second"))).log)
      .toEqual([["error", "second"]]);
    expect(failure(record(flatMap(succeed(2), () => {
      throw "in f";
    })).log))
      .toEqual({ message: "in f", cause: "in f" });
  });

  test("toPromise resolves or rejects", async () => {
    await expect(toPromise(succeed(1)))
      .resolves
      .toBe(1);
    await expect(toPromise(fail("e")))
      .rejects
      .toBe("e");
  });

  describe("monad laws", () => {
    const f = (n: number): Task<number, string> =>
      n > 0 ? succeed(n * 2) : fail("not positive");
    const g = (n: number) => succeed(`#${n}`);
    const tasks: Task<number, string>[] = [succeed(3), succeed(-1), fail("e")];
    const outcome = <T, E>(t: Task<T, E>) => record(t).log;

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) {
        expect(outcome(flatMap(succeed(a), f)))
          .toEqual(outcome(f(a)));
      }
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of tasks) {
        expect(outcome(flatMap(m, (value: number) => succeed(value))))
          .toEqual(outcome(m));
      }
    });
    test("associativity", () => {
      for (const m of tasks) {
        expect(outcome(flatMap(flatMap(m, f), g)))
          .toEqual(outcome(flatMap(m, (x: number) => flatMap(f(x), g))));
      }
    });
  });
});

describe("Task as a stream", () => {
  test("a task is a stream with no items, ending with its outcome", () => {
    const events: unknown[] = [];
    const observe = (task: Task<number, string>) => subscribe(task, {
      next: () => events.push("item"),
      end: (result) => events.push(match(result, {
        Left: (e) => ["left", e],
        Right: (v) => ["right", v],
      })),
    });
    observe(succeed(1));
    observe(fail("bad"));
    expect(events)
      .toEqual([["right", 1], ["left", "bad"]]);
  });

  test("is lazy as a stream too: each run runs it again", () => {
    let runs = 0;
    const task = fromComputation<number>((ok) => (runs++, ok(runs)));
    expect(runs)
      .toBe(0);
    const seen: number[] = [];
    run(task, { ok: (n) => seen.push(n) });
    run(task, { ok: (n) => seen.push(n) });
    expect(seen)
      .toEqual([1, 2]);
  });
});

describe("Task with time", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("delay succeeds after the time; cancelling clears the timer", () => {
    const { log } = record(map(delay(100), () => "done"));
    vi.advanceTimersByTime(99);
    expect(log)
      .toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log)
      .toEqual([["ok", "done"]]);

    const cancelled = record(delay(100));
    cancelled.cancel();
    vi.advanceTimersByTime(200);
    expect(cancelled.log)
      .toEqual([]);
    expect(vi.getTimerCount())
      .toBe(0);
  });

  test("cancelling a flatMap cancels whichever step is running", () => {
    const steps: string[] = [];
    const task = flatMap(
      map(delay(100), () => steps.push("first done")),
      () => map(delay(100), () => steps.push("second done")),
    );

    const early = record(task);
    early.cancel(); // during the first step
    vi.advanceTimersByTime(300);
    expect(steps)
      .toEqual([]);

    const late = record(task);
    vi.advanceTimersByTime(150); // the second step is running now
    late.cancel();
    vi.advanceTimersByTime(300);
    expect(steps)
      .toEqual(["first done"]);
    expect(late.log)
      .toEqual([]);
  });

  test("cancelling after the task finished does nothing", () => {
    const { log, cancel } = record(succeed(1));
    cancel();
    expect(log)
      .toEqual([["ok", 1]]);
  });

  test("timeout: fails with a TimeoutError and cancels a slow task", () => {
    let finished = false;
    const slow = map(delay(1000), () => (finished = true));
    const { log } = record(timeout(slow, 100));
    vi.advanceTimersByTime(100);
    expect(log)
      .toHaveLength(1);
    const [kind, error] = log[0] as [string, TimeoutError];
    expect(kind)
      .toBe("error");
    expect(error)
      .toBeInstanceOf(TimeoutError);
    expect(error.message)
      .toBe("Task timed out after 100 ms");
    expect(error.milliseconds)
      .toBe(100);
    vi.advanceTimersByTime(2000);
    expect(finished)
      .toBe(false); // the slow task was cancelled
  });

  test("timeout: a fast task wins, and its errors pass through", () => {
    const fast = record(timeout(map(delay(50), () => "fast"), 100));
    vi.advanceTimersByTime(50);
    expect(fast.log)
      .toEqual([["ok", "fast"]]);
    vi.advanceTimersByTime(100);
    expect(fast.log)
      .toEqual([["ok", "fast"]]);
    expect(record(timeout(fail("e"), 100)).log)
      .toEqual([["error", "e"]]);
  });

  test("timeout: cancelling clears both timers", () => {
    const { log, cancel } = record(timeout(delay(1000), 100));
    cancel();
    vi.advanceTimersByTime(2000);
    expect(log)
      .toEqual([]);
    expect(vi.getTimerCount())
      .toBe(0);
  });
});

describe("fromPromise", () => {
  test("starts the promise only when run, and settles with it", async () => {
    let started = 0;
    const task = fromPromise(async () => (started++, 1));
    expect(started)
      .toBe(0);
    await expect(toPromise(task))
      .resolves
      .toBe(1);
    const rejecting = fromPromise(async () => {
      throw "rejected";
    });
    await expect(toPromise(rejecting))
      .rejects
      .toMatchObject({ message: "rejected", cause: "rejected" });
  });

  test("cancelling aborts the signal, and the result is ignored", async () => {
    let signal: AbortSignal | undefined;
    const { log, cancel } = record(
      fromPromise((s) => {
        signal = s;
        return Promise.resolve("too late");
      }),
    );
    cancel();
    expect(signal?.aborted)
      .toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(log)
      .toEqual([]);
  });
});

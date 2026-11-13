import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Either } from "./either.ts";
import { Task, TimeoutError } from "./task.ts";

/** Run a task and record what happens (synchronously, or after timers/promises). */
function record<T>(task: Task<T>) {
  const log: unknown[] = [];
  const cancel = task.run({ ok: (v) => log.push(["ok", v]), error: (e) => log.push(["error", e]) });
  return { log, cancel };
}

describe("Task", () => {
  test("is lazy: nothing happens until run", () => {
    let started = 0;
    const task = Task.create<number>((ok) => (started++, ok(1)));
    expect(started).toBe(0);
    expect(record(task).log).toEqual([["ok", 1]]);
    expect(record(task).log).toEqual([["ok", 1]]); // can run again
    expect(started).toBe(2);
  });

  test("of succeeds, fail fails, and a throwing computation fails", () => {
    expect(record(Task.of(1)).log).toEqual([["ok", 1]]);
    expect(record(Task.fail("bad")).log).toEqual([["error", "bad"]]);
    expect(record(Task.create(() => { throw "thrown"; })).log).toEqual([["error", "thrown"]]);
  });

  test("calls one handler, once", () => {
    const task = Task.create<number>((ok, error) => {
      ok(1);
      ok(2);
      error("late");
    });
    expect(record(task).log).toEqual([["ok", 1]]);
  });

  test("an error thrown by an ok handler is not swallowed either", () => {
    expect(() => Task.of(1).run({ ok: () => { throw new Error("in handler"); } })).toThrow("in handler");
  });

  test("without an error handler, an error is re-thrown", () => {
    expect(() => Task.fail("bad").run()).toThrow();
    expect(() => Task.fail(new Error("bad")).run({ ok: () => {} })).toThrow("bad");
    expect(() => Task.of(1).run()).not.toThrow();
  });

  test("map transforms the result; an error in f fails the task", () => {
    expect(record(Task.of(2).map((n) => n * 10)).log).toEqual([["ok", 20]]);
    expect(record(Task.fail<number>("e").map((n) => n * 10)).log).toEqual([["error", "e"]]);
    expect(record(Task.of(2).map(() => { throw "in f"; })).log).toEqual([["error", "in f"]]);
  });

  test("flatMap chains tasks; errors anywhere fail the whole", () => {
    expect(record(Task.of(2).flatMap((n) => Task.of(n + 1))).log).toEqual([["ok", 3]]);
    expect(record(Task.fail<number>("first").flatMap((n) => Task.of(n))).log).toEqual([["error", "first"]]);
    expect(record(Task.of(2).flatMap(() => Task.fail("second"))).log).toEqual([["error", "second"]]);
    expect(record(Task.of(2).flatMap(() => { throw "in f"; })).log).toEqual([["error", "in f"]]);
  });

  test("fromEither: a Right succeeds, a Left fails", () => {
    expect(record(Task.fromEither(Either.right(1))).log).toEqual([["ok", 1]]);
    expect(record(Task.fromEither(Either.left("e"))).log).toEqual([["error", "e"]]);
  });

  test("toPromise resolves or rejects", async () => {
    await expect(Task.of(1).toPromise()).resolves.toBe(1);
    await expect(Task.fail("e").toPromise()).rejects.toBe("e");
  });

  describe("monad laws", () => {
    const f = (n: number) => (n > 0 ? Task.of(n * 2) : Task.fail<number>("not positive"));
    const g = (n: number) => Task.of(`#${n}`);
    const tasks = [Task.of(3), Task.of(-1), Task.fail<number>("e")];
    const outcome = <T>(t: Task<T>) => record(t).log;

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) expect(outcome(Task.of(a).flatMap(f))).toEqual(outcome(f(a)));
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of tasks) expect(outcome(m.flatMap(Task.of))).toEqual(outcome(m));
    });
    test("associativity", () => {
      for (const m of tasks) {
        expect(outcome(m.flatMap(f).flatMap(g))).toEqual(outcome(m.flatMap((x) => f(x).flatMap(g))));
      }
    });
  });
});

describe("Task with time", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("delay succeeds after the time; cancelling clears the timer", () => {
    const { log } = record(Task.delay(100).map(() => "done"));
    vi.advanceTimersByTime(99);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual([["ok", "done"]]);

    const cancelled = record(Task.delay(100));
    cancelled.cancel();
    vi.advanceTimersByTime(200);
    expect(cancelled.log).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("cancelling a flatMap cancels whichever step is running", () => {
    const steps: string[] = [];
    const task = Task.delay(100)
      .map(() => steps.push("first done"))
      .flatMap(() => Task.delay(100).map(() => steps.push("second done")));

    const early = record(task);
    early.cancel(); // during the first step
    vi.advanceTimersByTime(300);
    expect(steps).toEqual([]);

    const late = record(task);
    vi.advanceTimersByTime(150); // the second step is running now
    late.cancel();
    vi.advanceTimersByTime(300);
    expect(steps).toEqual(["first done"]);
    expect(late.log).toEqual([]);
  });

  test("cancelling after the task finished does nothing", () => {
    const { log, cancel } = record(Task.of(1));
    cancel();
    expect(log).toEqual([["ok", 1]]);
  });

  test("timeout: fails with a TimeoutError and cancels a slow task", () => {
    let finished = false;
    const slow = Task.delay(1000).map(() => (finished = true));
    const { log } = record(slow.timeout(100));
    vi.advanceTimersByTime(100);
    expect(log).toHaveLength(1);
    const [kind, error] = log[0] as [string, TimeoutError];
    expect(kind).toBe("error");
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toBe("Task timed out after 100 ms");
    expect(error.milliseconds).toBe(100);
    vi.advanceTimersByTime(2000);
    expect(finished).toBe(false); // the slow task was cancelled
  });

  test("timeout: a fast task wins, and its errors pass through", () => {
    const fast = record(Task.delay(50).map(() => "fast").timeout(100));
    vi.advanceTimersByTime(50);
    expect(fast.log).toEqual([["ok", "fast"]]);
    vi.advanceTimersByTime(100);
    expect(fast.log).toEqual([["ok", "fast"]]);
    expect(record(Task.fail("e").timeout(100)).log).toEqual([["error", "e"]]);
  });

  test("timeout: cancelling clears both timers", () => {
    const { log, cancel } = record(Task.delay(1000).timeout(100));
    cancel();
    vi.advanceTimersByTime(2000);
    expect(log).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Task.fromPromise", () => {
  test("starts the promise only when run, and settles with it", async () => {
    let started = 0;
    const task = Task.fromPromise(async () => (started++, 1));
    expect(started).toBe(0);
    await expect(task.toPromise()).resolves.toBe(1);
    await expect(Task.fromPromise(async () => { throw "rejected"; }).toPromise()).rejects.toBe("rejected");
  });

  test("cancelling aborts the signal, and the result is ignored", async () => {
    let signal: AbortSignal | undefined;
    const { log, cancel } = record(
      Task.fromPromise((s) => {
        signal = s;
        return Promise.resolve("too late");
      }),
    );
    cancel();
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual([]);
  });
});

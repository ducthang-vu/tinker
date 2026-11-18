import { describe, expect, test, vi } from "vitest";
import { inject, Injector, runInInjectionContext } from "../../../../di/index.ts";
import { signal, watch } from "../../../../signals/index.ts";
import { ViewScheduler } from "./view-scheduler.ts";
import { Ticker } from "../ticker.ts";

/** A task that records its runs. */
const task = (log: string[], name: string, run?: () => void) => ({
  run() {
    log.push(name);
    run?.();
  },
});

/** The scheduler and its Ticker, from an injector; tick requests are counted. */
function setup() {
  const { injector } = Injector.create({ providers: [Ticker, ViewScheduler] });
  const { scheduler, ticker } = runInInjectionContext(injector, () => ({
    scheduler: inject(ViewScheduler),
    ticker: inject(Ticker),
  }));
  const requestTick = vi.spyOn(ticker, "requestTick");
  const requests = {
    get count() {
      return requestTick.mock.calls.length;
    },
  };
  return { scheduler, requests, log: [] as string[] };
}

describe("ViewScheduler", () => {
  test("queues tasks, requests a tick each time, and runs them on flush", () => {
    const { scheduler, requests, log } = setup();
    scheduler.schedule(task(log, "a"));
    scheduler.schedule(task(log, "b"));
    expect(requests.count)
      .toBe(2);
    expect(scheduler.pending)
      .toBe(2);
    expect(log)
      .toEqual([]); // it only queues
    scheduler.flush();
    expect(log)
      .toEqual(["a", "b"]);
    expect(scheduler.pending)
      .toBe(0);
  });

  test("a task scheduled twice runs once", () => {
    const { scheduler, log } = setup();
    const a = task(log, "a");
    scheduler.schedule(a);
    scheduler.schedule(a);
    scheduler.flush();
    expect(log)
      .toEqual(["a"]);
  });

  test("flush runs one batch: tasks scheduled meanwhile wait for the next one", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "a", () => scheduler.schedule(task(log, "b"))));
    scheduler.flush();
    expect(log)
      .toEqual(["a"]);
    expect(scheduler.pending)
      .toBe(1);
    scheduler.flush();
    expect(log)
      .toEqual(["a", "b"]);
  });

  test("every task runs even if one throws; the first error is re-thrown", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "a", () => {
      throw new Error("first");
    }));
    scheduler.schedule(task(log, "b", () => {
      throw new Error("second");
    }));
    scheduler.schedule(task(log, "c"));
    expect(() => scheduler.flush())
      .toThrow("first");
    expect(log)
      .toEqual(["a", "b", "c"]);
  });

  test("discard drops the queued tasks without running them", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "a"));
    scheduler.discard();
    scheduler.flush();
    expect(log)
      .toEqual([]);
    expect(scheduler.pending)
      .toBe(0);
  });

  test("only the watches affected by a change are queued", () => {
    const { scheduler } = setup();
    const count = signal(0);
    const other = signal(0);
    const log: string[] = [];
    watch(() => log.push(`count ${count()}`), scheduler);
    watch(() => log.push(`other ${other()}`), scheduler);
    scheduler.flush();
    count.set(1);
    count.set(2);
    scheduler.flush();
    expect(log)
      .toEqual(["count 0", "other 0", "count 2"]);
  });
});

describe("ViewScheduler: parents first", () => {
  test("a batch runs the shallower views first, whatever the order they were queued in", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "child"), 2);
    scheduler.schedule(task(log, "root"), 0);
    scheduler.schedule(task(log, "parent"), 1);
    scheduler.flush();
    expect(log)
      .toEqual(["root", "parent", "child"]);
  });

  test("views at the same depth keep the order they were queued in", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "b"), 1);
    scheduler.schedule(task(log, "a"), 1);
    scheduler.flush();
    expect(log)
      .toEqual(["b", "a"]);
  });

  test("a view queued again keeps one place, at its latest depth", () => {
    const { scheduler, log } = setup();
    const view = task(log, "view");
    scheduler.schedule(view, 3);
    scheduler.schedule(task(log, "other"), 1);
    scheduler.schedule(view, 0);
    scheduler.flush();
    expect(log)
      .toEqual(["view", "other"]);
  });

  test("forDepth queues the views at that depth", () => {
    const { scheduler, log } = setup();
    scheduler.forDepth(2)
      .schedule(task(log, "deep"));
    scheduler.forDepth(0)
      .schedule(task(log, "root"));
    scheduler.flush();
    expect(log)
      .toEqual(["root", "deep"]);
  });

  test("work queued by an update runs in the next batch, after the others", () => {
    const { scheduler, log } = setup();
    scheduler.schedule(task(log, "parent", () => scheduler.schedule(task(log, "late"), 0)), 0);
    scheduler.schedule(task(log, "child"), 1);
    scheduler.flush();
    expect(log)
      .toEqual(["parent", "child"]);
    scheduler.flush();
    expect(log)
      .toEqual(["parent", "child", "late"]);
  });
});

import { describe, expect, test } from "vitest";
import { signal, watch } from "../signals/index.ts";
import { ViewScheduler } from "./view-scheduler.ts";

/** A task that records its runs. */
const task = (log: string[], name: string, run?: () => void) => ({
  run() {
    log.push(name);
    run?.();
  },
});

describe("ViewScheduler", () => {
  test("queues tasks, and runs them all on flush", () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    scheduler.schedule(task(log, "a"));
    scheduler.schedule(task(log, "b"));
    expect(scheduler.pending).toBe(2);
    scheduler.flush();
    expect(log).toEqual(["a", "b"]);
    expect(scheduler.pending).toBe(0);
  });

  test("a task scheduled twice runs once", () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    const a = task(log, "a");
    scheduler.schedule(a);
    scheduler.schedule(a);
    scheduler.flush();
    expect(log).toEqual(["a"]);
  });

  test("flushes by itself in a microtask, once for many schedules", async () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    scheduler.schedule(task(log, "a"));
    scheduler.schedule(task(log, "b"));
    expect(log).toEqual([]);
    await Promise.resolve();
    expect(log).toEqual(["a", "b"]);
  });

  test("after a flush, the next schedule requests a new microtask flush", async () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    scheduler.schedule(task(log, "a"));
    await Promise.resolve();
    scheduler.schedule(task(log, "b"));
    await Promise.resolve();
    expect(log).toEqual(["a", "b"]);
  });

  test("tasks scheduled during a flush run in the same flush", () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    scheduler.schedule(task(log, "a", () => scheduler.schedule(task(log, "b"))));
    scheduler.flush();
    expect(log).toEqual(["a", "b"]);
  });

  test("every task runs even if one throws; the first error is re-thrown", () => {
    const scheduler = new ViewScheduler();
    const log: string[] = [];
    scheduler.schedule(task(log, "a", () => { throw new Error("first"); }));
    scheduler.schedule(task(log, "b", () => { throw new Error("second"); }));
    scheduler.schedule(task(log, "c"));
    expect(() => scheduler.flush()).toThrow("first");
    expect(log).toEqual(["a", "b", "c"]);
  });

  test("only the watches affected by a change run, once per flush", () => {
    const scheduler = new ViewScheduler();
    const count = signal(0);
    const other = signal(0);
    const log: string[] = [];
    watch(() => log.push(`count ${count()}`), scheduler);
    watch(() => log.push(`other ${other()}`), scheduler);
    scheduler.flush();
    count.set(1);
    count.set(2);
    scheduler.flush();
    expect(log).toEqual(["count 0", "other 0", "count 2"]);
  });
});

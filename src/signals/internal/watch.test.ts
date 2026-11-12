import { describe, expect, test } from "vitest";
import { Computed } from "./computed.ts";
import { WatchLoopError } from "./errors.ts";
import { Signal } from "./signal.ts";
import { type Runnable, Watch, type WatchScheduler } from "./watch.ts";

const sync: WatchScheduler = { schedule: (task) => task.run() };
const microtask: WatchScheduler = { schedule: (task) => queueMicrotask(() => task.run()) };

describe("scheduling", () => {
  test("sync scheduler: runs at once and after every real change", () => {
    const a = new Signal(1);
    const seen: number[] = [];
    new Watch(() => seen.push(a.get()), sync);
    a.set(2);
    a.set(2);
    a.set(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  test("manual queue: scheduled once while dirty", () => {
    const a = new Signal(1);
    const queue: Runnable[] = [];
    const seen: number[] = [];
    const w = new Watch(() => seen.push(a.get()), { schedule: (task) => queue.push(task) });
    expect(seen).toEqual([]);
    expect(queue).toEqual([w]); // the watch passes itself
    queue.shift()!.run();
    a.set(2);
    a.set(3);
    expect(queue).toHaveLength(1);
    queue.shift()!.run();
    expect(seen).toEqual([1, 3]);
  });

  test("microtask scheduler batches writes", async () => {
    const a = new Signal(1);
    const seen: number[] = [];
    new Watch(() => seen.push(a.get()), microtask);
    a.set(2);
    a.set(3);
    await Promise.resolve();
    expect(seen).toEqual([3]);
  });

  test("skips the run when a computed it reads did not really change", () => {
    const a = new Signal(2);
    const parity = new Computed(() => a.get() % 2);
    let runs = 0;
    new Watch(() => {
      parity.get();
      runs++;
    }, sync);
    a.set(4);
    expect(runs).toBe(1);
    a.set(5);
    expect(runs).toBe(2);
  });

  test("drops dependencies it no longer reads", () => {
    const useA = new Signal(true);
    const a = new Signal("a");
    const b = new Signal("b");
    const seen: string[] = [];
    new Watch(() => seen.push(useA.get() ? a.get() : b.get()), sync);
    useA.set(false);
    a.set("a2");
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("cleanup and destroy", () => {
  test("cleanup runs before the next run and on destroy; destroy stops it", () => {
    const a = new Signal(1);
    const log: string[] = [];
    const w = new Watch((onCleanup) => {
      const v = a.get();
      log.push(`run ${v}`);
      onCleanup(() => log.push(`cleanup ${v}`));
    }, sync);
    a.set(2);
    w.destroy();
    a.set(3);
    expect(log).toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
  });

  test("destroying twice is harmless", () => {
    let cleanups = 0;
    const w = new Watch((onCleanup) => onCleanup(() => cleanups++), sync);
    w.destroy();
    w.destroy();
    expect(cleanups).toBe(1);
  });
});

describe("no user code during marking", () => {
  test("a sync watch never sees a half-updated graph", () => {
    const a = new Signal(1);
    const b = new Computed(() => a.get() * 10);
    const seen: string[] = [];
    new Watch(() => seen.push(`${a.get()}/${b.get()}`), sync);
    a.set(2);
    expect(seen).toEqual(["1/10", "2/20"]);
  });

  test("a throwing watch does not leave other consumers stale", () => {
    const a = new Signal(1);
    new Watch(() => {
      if (a.get() === 2) throw new Error("watch failed");
    }, sync);
    const c = new Computed(() => a.get() * 10);
    c.get();
    expect(() => a.set(2)).toThrow("watch failed");
    expect(c.get()).toBe(20);
  });

  test("all watches run even if one throws", () => {
    const a = new Signal(1);
    const seen: number[] = [];
    new Watch(() => {
      if (a.get() === 2) throw new Error("first");
    }, sync);
    new Watch(() => seen.push(a.get()), sync);
    expect(() => a.set(2)).toThrow("first");
    expect(seen).toEqual([1, 2]);
  });

  test("a computed error does not escape into set()", () => {
    const a = new Signal(0);
    const c = new Computed(() => {
      if (a.get() === 1) throw new Error("boom");
      return a.get();
    });
    const seen: unknown[] = [];
    new Watch(() => {
      try {
        seen.push(c.get());
      } catch {
        seen.push("err");
      }
    }, sync);
    expect(() => a.set(1)).not.toThrow();
    a.set(2);
    expect(seen).toEqual([0, "err", 2]);
  });
});

describe("writing its own dependencies", () => {
  test("re-runs after itself, never inside itself, until settled", () => {
    const a = new Signal(0);
    let depth = 0;
    let maxDepth = 0;
    let runs = 0;
    new Watch(() => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      runs++;
      if (a.get() < 3) a.update((n) => n + 1);
      depth--;
    }, sync);
    expect(a.get()).toBe(3);
    expect(runs).toBe(4);
    expect(maxDepth).toBe(1);
  });

  test("an endless loop throws WatchLoopError instead of hanging", () => {
    const a = new Signal(0);
    expect(() => new Watch(() => a.set(a.get() + 1), sync)).toThrow(WatchLoopError);
  });

  test("is not stuck after an error", () => {
    const a = new Signal(0);
    const fail = new Signal(true);
    const seen: number[] = [];
    try {
      new Watch(() => {
        seen.push(a.get());
        if (fail.get()) throw new Error("x");
      }, sync);
    } catch {
      // expected
    }
    fail.set(false);
    a.set(5);
    expect(seen.at(-1)).toBe(5);
  });
});

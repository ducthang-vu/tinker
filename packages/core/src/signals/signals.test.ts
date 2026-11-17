import { describe, expect, expectTypeOf, test } from "vitest";
import {
  computed,
  type ReadonlySignal,
  type Runnable,
  type Signal,
  SignalCycleError,
  SignalWriteError,
  signal,
  untracked,
  type Watch,
  WatchLoopError,
  type WatchScheduler,
  watch,
} from "./index.ts";

const sync: WatchScheduler = { schedule: (task) => task.run() };

describe("signal()", () => {
  test("reads, writes and updates", () => {
    const count = signal(1);
    expectTypeOf(count)
      .toEqualTypeOf<Signal<number>>();
    count.set(2);
    count.update((n) => n + 1);
    expect(count())
      .toBe(3);
    expect(untracked(() => count()))
      .toBe(3);
  });

  test("custom equality", () => {
    const user = signal({ id: 1, name: "Ada" }, (a, b) => a.id === b.id);
    user.set({ id: 1, name: "Changed" });
    expect(user().name)
      .toBe("Ada");
  });

  test("asReadonly gives a read-only view", () => {
    const count = signal(1);
    const view = count.asReadonly();
    expectTypeOf(view)
      .toEqualTypeOf<ReadonlySignal<number>>();
    count.set(2);
    expect(view())
      .toBe(2);
  });
});

describe("computed()", () => {
  test("derives, caches and follows its dependencies", () => {
    const count = signal(2);
    let runs = 0;
    const doubled = computed(() => {
      runs++;
      return count() * 2;
    });
    expectTypeOf(doubled)
      .toEqualTypeOf<ReadonlySignal<number>>();
    expect(doubled())
      .toBe(4);
    expect(doubled())
      .toBe(4);
    expect(runs)
      .toBe(1);
    count.set(3);
    expect(doubled())
      .toBe(6);
  });

  test("custom equality keeps the previous value", () => {
    const ids = signal([1, 2]);
    const sorted = computed(() => [...ids()].sort(), (a, b) => a.join() === b.join());
    const first = sorted();
    ids.set([2, 1]);
    expect(sorted())
      .toBe(first);
  });
});

describe("watch()", () => {
  test("runs, re-runs on change, cleans up and stops", () => {
    const count = signal(1);
    const log: string[] = [];
    const w = watch((onCleanup) => {
      const v = count();
      log.push(`run ${v}`);
      onCleanup(() => log.push(`cleanup ${v}`));
    }, sync);
    expectTypeOf(w)
      .toEqualTypeOf<Watch>();
    count.set(2);
    w.destroy();
    count.set(3);
    expect(log)
      .toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
  });

  test("the scheduler receives a task that only exposes run()", async () => {
    const count = signal(1);
    const seen: number[] = [];
    watch(() => seen.push(count()), {
      schedule(task) {
        expectTypeOf(task)
          .toEqualTypeOf<Runnable>();
        queueMicrotask(() => task.run());
      },
    });
    count.set(2);
    await Promise.resolve();
    expect(seen)
      .toEqual([2]);
  });

  test("a scheduler can be a stateful class", () => {
    class ManualScheduler implements WatchScheduler {
      private readonly pending: Runnable[] = [];
      schedule(task: Runnable): void {
        this.pending.push(task);
      }

      flush(): void {
        this.pending.splice(0)
          .forEach((task) => task.run());
      }
    }
    const scheduler = new ManualScheduler();
    const count = signal(1);
    const seen: number[] = [];
    watch(() => seen.push(count()), scheduler);
    expect(seen)
      .toEqual([]);
    scheduler.flush();
    count.set(2);
    count.set(3);
    scheduler.flush();
    expect(seen)
      .toEqual([1, 3]);
  });
});

describe("callable signals", () => {
  test("a signal can be passed wherever a getter is expected", () => {
    const count = signal(2);
    const read = count; // no lost `this`
    expect(read())
      .toBe(2);
    expect([1, 2].map(() => 0)
      .map(count))
      .toEqual([2, 2]);
    const doubled = computed(() => count() * 2);
    const again = computed(doubled);
    expect(again())
      .toBe(4);
  });

  test("the internal node cannot be reached at runtime", () => {
    const s = signal(1);
    const c = computed(() => s());
    const w = watch(() => {}, sync);
    expect(Object.keys(s)
      .sort())
      .toEqual(["asReadonly", "set", "update"]);
    expect(Object.keys(s.asReadonly()))
      .toEqual([]);
    expect(Object.keys(c))
      .toEqual([]);
    expect(Object.keys(w))
      .toEqual(["destroy"]);
    for (const value of [s, c, w]) {
      expect("markDirty" in value)
        .toBe(false);
      expect("version" in value)
        .toBe(false);
      expect("get" in value)
        .toBe(false);
      expect("getUntracked" in value)
        .toBe(false);
    }
  });

  test("asReadonly returns the same view every time", () => {
    const s = signal(1);
    expect(s.asReadonly())
      .toBe(s.asReadonly());
    expect("set" in s.asReadonly())
      .toBe(false);
  });
});

describe("exports", () => {
  test("untracked and the error classes", () => {
    const a = signal(1);
    const c = computed(() => untracked(() => a()));
    expect(c())
      .toBe(1);
    a.set(2);
    expect(c())
      .toBe(1);
    expect(() => computed(() => a.set(3))())
      .toThrow(SignalWriteError);
    const box: { c?: ReadonlySignal<number> } = {};
    box.c = computed(() => box.c!());
    expect(() => box.c!())
      .toThrow(SignalCycleError);
    expect(() => watch(() => a.set(a() + 1), sync))
      .toThrow(WatchLoopError);
  });

  test("internals are not part of the public types", () => {
    const s = signal(1);
    const c = computed(() => s());
    const w = watch(() => {}, sync);
    expectTypeOf(s).not.toHaveProperty("version");
    expectTypeOf(s).not.toHaveProperty("removeConsumer");
    expectTypeOf(s).not.toHaveProperty("sync");
    expectTypeOf(c).not.toHaveProperty("markDirty");
    expectTypeOf(c).not.toHaveProperty("addDependency");
    expectTypeOf(c).not.toHaveProperty("dirty");
    expectTypeOf(c).not.toHaveProperty("set");
    expectTypeOf(w).not.toHaveProperty("markDirty");
    expectTypeOf(w).not.toHaveProperty("run");
    expectTypeOf(s.asReadonly()).not.toHaveProperty("set");
  });
});

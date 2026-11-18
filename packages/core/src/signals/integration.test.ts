// Integration: signals, computeds and watches working together, with no test doubles.
// Each test builds a small graph of real signals and checks what runs, how often, and
// in what order, as a change propagates through it.

import { describe, expect, test } from "vitest";
import { computed, signal, untracked, watch, type WatchScheduler } from "./index.ts";
import { SignalCycleError, SignalWriteError } from "./index.ts";

/** Runs each scheduled task at once: the watch re-runs as soon as a signal changes. */
const sync: WatchScheduler = { schedule: (task) => task.run() };

/** Holds scheduled tasks until `flush()`, so a batch of writes runs as one. */
function queued() {
  const tasks: { run(): void }[] = [];
  return {
    scheduler: { schedule: (task: { run(): void }) => tasks.push(task) } as WatchScheduler,
    flush: () => {
      for (const task of tasks.splice(0)) {
        task.run();
      }
    },
  };
}

describe("a diamond: one source reaching a watch through two paths", () => {
  test("the watch runs once per change, and always sees consistent values", () => {
    const a = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => a() + 1);
    const d = computed(() => b() + c());
    const seen: number[] = [];
    const w = watch(() => {
      seen.push(d());
    }, sync);
    a.set(2);
    a.set(3);
    w.destroy();
    expect(seen)
      .toEqual([4, 7, 10]);
  });

  test("a computed is recomputed only when it is read after a change", () => {
    const a = signal(1);
    let runs = 0;
    const doubled = computed(() => {
      runs += 1;
      return a() * 2;
    });
    expect(runs)
      .toBe(0);
    expect(doubled())
      .toBe(2);
    expect(doubled())
      .toBe(2);
    expect(runs)
      .toBe(1);
    a.set(5);
    expect(runs)
      .toBe(1);
    expect(doubled())
      .toBe(10);
    expect(runs)
      .toBe(2);
  });
});

describe("equality cuts a change off before it spreads", () => {
  test("a computed that gives an equal value does not wake its readers", () => {
    const n = signal(1);
    const parity = computed(() => n() % 2);
    let runs = 0;
    const w = watch(() => {
      parity();
      runs += 1;
    }, sync);
    n.set(3);
    n.set(5);
    expect(runs)
      .toBe(1);
    n.set(4);
    expect(runs)
      .toBe(2);
    w.destroy();
  });

  test("a signal with a custom equality ignores changes it considers equal", () => {
    const point = signal({ x: 1 }, (a, b) => a.x === b.x);
    let runs = 0;
    const w = watch(() => {
      point();
      runs += 1;
    }, sync);
    point.set({ x: 1 });
    expect(runs)
      .toBe(1);
    point.set({ x: 2 });
    expect(runs)
      .toBe(2);
    w.destroy();
  });
});

describe("watches with cleanup and untracked reads", () => {
  test("cleanup runs before each re-run and on destroy, in order", () => {
    const count = signal(0);
    const log: string[] = [];
    const w = watch((onCleanup) => {
      const value = count();
      log.push(`run ${value}`);
      onCleanup(() => log.push(`cleanup ${value}`));
    }, sync);
    count.set(1);
    w.destroy();
    count.set(2);
    expect(log)
      .toEqual(["run 0", "cleanup 0", "run 1", "cleanup 1"]);
  });

  test("an untracked read does not make the watch depend on that signal", () => {
    const shown = signal("a");
    const hidden = signal("secret");
    let runs = 0;
    const w = watch(() => {
      shown();
      untracked(() => hidden());
      runs += 1;
    }, sync);
    hidden.set("other");
    expect(runs)
      .toBe(1);
    shown.set("b");
    expect(runs)
      .toBe(2);
    w.destroy();
  });

  test("with a queued scheduler, several writes in one batch run the watch once", () => {
    const { scheduler, flush } = queued();
    const first = signal("Ada");
    const last = signal("Lovelace");
    const full = computed(() => `${first()} ${last()}`);
    const seen: string[] = [];
    const w = watch(() => {
      seen.push(full());
    }, scheduler);
    flush();
    first.set("Grace");
    last.set("Hopper");
    flush();
    w.destroy();
    expect(seen)
      .toEqual(["Ada Lovelace", "Grace Hopper"]);
  });
});

describe("errors in the graph are reported where they happen", () => {
  test("a computed that reads itself is a cycle error", () => {
    const self: { read?: () => number } = {};
    const loop = computed(() => (self.read ? self.read() : 0));
    self.read = loop;
    expect(() => loop())
      .toThrow(SignalCycleError);
  });

  test("writing a signal inside a computed is a write error", () => {
    const source = signal(1);
    const other = signal(0);
    const bad = computed(() => {
      other.set(source());
      return source();
    });
    expect(() => bad())
      .toThrow(SignalWriteError);
  });
});

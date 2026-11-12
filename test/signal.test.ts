import { describe, expect, test } from "vitest";
import { computed, effect, signal } from "../src/signal.ts";

describe("signal", () => {
  test("reads and writes", () => {
    const count = signal(1);
    expect(count()).toBe(1);
    count.set(2);
    expect(count()).toBe(2);
    count.set((n) => n + 1);
    expect(count()).toBe(3);
  });
});

describe("effect", () => {
  test("re-runs when a signal it read changes", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => seen.push(count()));
    count.set(1);
    count.set(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  test("does not re-run when the value is unchanged", () => {
    const count = signal(0);
    let runs = 0;
    effect(() => {
      count();
      runs++;
    });
    count.set(0);
    expect(runs).toBe(1);
  });

  test("stops when the stop function is called", () => {
    const count = signal(0);
    let runs = 0;
    const stop = effect(() => {
      count();
      runs++;
    });
    stop();
    count.set(1);
    expect(runs).toBe(1);
  });

  test("only tracks signals read in the latest run", () => {
    const useA = signal(true);
    const a = signal("a");
    const b = signal("b");
    let runs = 0;
    effect(() => {
      runs++;
      if (useA()) a();
      else b();
    });
    useA.set(false);
    a.set("a2"); // no longer read, so it should not re-run
    expect(runs).toBe(2);
  });
});

describe("computed", () => {
  test("derives from other signals", () => {
    const n = signal(2);
    const doubled = computed(() => n() * 2);
    expect(doubled()).toBe(4);
    n.set(5);
    expect(doubled()).toBe(10);
  });
});

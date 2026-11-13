import { describe, expect, test } from "vitest";
import { Computed } from "./computed.ts";
import { SignalCycleError } from "./errors.ts";
import { Signal } from "./signal.ts";

/** A computed that counts how often its computation runs. */
function counted<T>(fn: () => T): { c: Computed<T>; runs: () => number } {
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return fn();
  });
  return { c, runs: () => runs };
}

describe("caching and laziness", () => {
  test("computes once, then serves the cache", () => {
    const a = new Signal(1);
    const { c, runs } = counted(() => a.get() * 2);
    expect(c.get())
      .toBe(2);
    expect(c.get())
      .toBe(2);
    expect(runs())
      .toBe(1);
  });

  test("recomputes after a dependency changes", () => {
    const a = new Signal(1);
    const { c, runs } = counted(() => a.get() * 2);
    c.get();
    a.set(5);
    expect(c.get())
      .toBe(10);
    expect(runs())
      .toBe(2);
  });

  test("is lazy: no recompute until read, however many writes", () => {
    const a = new Signal(1);
    const { c, runs } = counted(() => a.get());
    c.get();
    a.set(2);
    a.set(3);
    a.set(4);
    expect(runs())
      .toBe(1);
    expect(c.get())
      .toBe(4);
    expect(runs())
      .toBe(2);
  });

  test("getUntracked returns a fresh value", () => {
    const a = new Signal(1);
    const c = new Computed(() => a.get() * 2);
    a.set(3);
    expect(c.getUntracked())
      .toBe(6);
  });
});

describe("propagation", () => {
  test("a chain updates", () => {
    const a = new Signal(1);
    const b = new Computed(() => a.get() * 2);
    const c = new Computed(() => b.get() + 1);
    expect(c.get())
      .toBe(3);
    a.set(5);
    expect(c.get())
      .toBe(11);
  });

  test("a diamond recomputes once and never sees a mix of old and new", () => {
    const a = new Signal(1);
    const b = new Computed(() => a.get() + 1);
    const c = new Computed(() => a.get() * 10);
    const seen: string[] = [];
    const d = new Computed(() => {
      const v = `${b.get()}/${c.get()}`;
      seen.push(v);
      return v;
    });
    d.get();
    a.set(2);
    expect(d.get())
      .toBe("3/20");
    expect(seen)
      .toEqual(["2/10", "3/20"]);
  });

  test("readers skip work when a dependency recomputes to the same value", () => {
    const a = new Signal(2);
    const parity = new Computed(() => a.get() % 2);
    const { c: label, runs } = counted(() => (parity.get() === 0 ? "even" : "odd"));
    expect(label.get())
      .toBe("even");
    a.set(4);
    expect(label.get())
      .toBe("even");
    expect(runs())
      .toBe(1);
    a.set(5);
    expect(label.get())
      .toBe("odd");
    expect(runs())
      .toBe(2);
  });

  test("two readers of one dependency both see its change", () => {
    const a = new Signal(1);
    const b = new Computed(() => a.get() * 2);
    const c = new Computed(() => b.get() + 1);
    const d = new Computed(() => b.get() + 2);
    c.get();
    d.get();
    a.set(5);
    expect(c.get())
      .toBe(11);
    expect(d.get())
      .toBe(12);
  });
});

describe("equality", () => {
  test("Object.is by default: version only bumps on a real change", () => {
    const a = new Signal(2);
    const parity = new Computed(() => a.get() % 2);
    parity.get();
    expect(parity.version)
      .toBe(1);
    a.set(4);
    parity.get();
    expect(parity.version)
      .toBe(1);
    a.set(5);
    parity.get();
    expect(parity.version)
      .toBe(2);
  });

  test("custom equality keeps the previous value", () => {
    const ids = new Signal([1, 2]);
    const sorted = new Computed(
      () => [...ids.get()].sort(),
      (x, y) => x.join() === y.join(),
    );
    const first = sorted.get();
    ids.set([2, 1]);
    expect(sorted.get())
      .toBe(first);
    ids.set([3, 1]);
    expect(sorted.get())
      .toEqual([1, 3]);
  });
});

describe("dependency cleanup", () => {
  test("a dependency that is no longer read stops causing recomputes", () => {
    const useA = new Signal(true);
    const a = new Signal("a");
    const b = new Signal("b");
    const { c, runs } = counted(() => (useA.get() ? a.get() : b.get()));
    expect(c.get())
      .toBe("a");
    useA.set(false);
    expect(c.get())
      .toBe("b");
    a.set("a2");
    expect(c.get())
      .toBe("b");
    expect(runs())
      .toBe(2);
  });
});

describe("errors", () => {
  const failsOn1 = (a: Signal<number>) =>
    counted(() => {
      if (a.get() === 1) throw new Error("boom");
      return a.get();
    });

  test("an error is cached and re-thrown on every read", () => {
    const a = new Signal(0);
    const { c, runs } = failsOn1(a);
    expect(c.get())
      .toBe(0);
    a.set(1);
    expect(() => c.get())
      .toThrow("boom");
    expect(() => c.get())
      .toThrow("boom");
    expect(runs())
      .toBe(2);
  });

  test("recovers when the dependency changes again", () => {
    const a = new Signal(0);
    const { c } = failsOn1(a);
    c.get();
    a.set(1);
    expect(() => c.get())
      .toThrow("boom");
    a.set(2);
    expect(c.get())
      .toBe(2);
  });

  test("an error passes through a chain, and later changes still propagate", () => {
    const a = new Signal(0);
    const { c } = failsOn1(a);
    const d = new Computed(() => c.get() + 1);
    const safe = new Computed(() => {
      try {
        return c.get();
      } catch {
        return "err";
      }
    });
    expect(d.get())
      .toBe(1);
    expect(safe.get())
      .toBe(0);
    a.set(1);
    expect(() => d.get())
      .toThrow("boom");
    expect(safe.get())
      .toBe("err");
    a.set(2);
    expect(safe.get())
      .toBe(2);
  });

  test("sync() never throws: the error waits for a reader", () => {
    const a = new Signal(1);
    const c = new Computed(() => {
      if (a.get() === 1) throw new Error("boom");
      return a.get();
    });
    expect(() => c.sync()).not.toThrow();
    expect(() => c.get())
      .toThrow("boom");
  });

  test("a throwing equality function is cached like a computation error", () => {
    const a = new Signal(1);
    const c = new Computed(
      () => a.get(),
      () => {
        throw new Error("bad equal");
      },
    );
    expect(c.get())
      .toBe(1);
    a.set(2);
    expect(() => c.get())
      .toThrow("bad equal");
    a.set(3);
    expect(c.get())
      .toBe(3);
  });
});

describe("cycles", () => {
  test("a computed reading itself throws SignalCycleError", () => {
    const box: { c?: Computed<number> } = {};
    box.c = new Computed(() => box.c!.get() + 1);
    expect(() => box.c!.get())
      .toThrow(SignalCycleError);
  });

  test("an indirect cycle throws SignalCycleError", () => {
    const box: { a?: Computed<number>; b?: Computed<number> } = {};
    box.a = new Computed(() => box.b!.get() + 1);
    box.b = new Computed(() => box.a!.get() + 1);
    expect(() => box.a!.get())
      .toThrow(SignalCycleError);
  });

  test("recovers when the cycle goes away", () => {
    const loop = new Signal(true);
    const box: { c?: Computed<number> } = {};
    box.c = new Computed(() => (loop.get() ? box.c!.get() : 7));
    expect(() => box.c!.get())
      .toThrow(SignalCycleError);
    loop.set(false);
    expect(box.c.get())
      .toBe(7);
  });
});

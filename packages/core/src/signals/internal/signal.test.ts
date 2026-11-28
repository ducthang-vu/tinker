import { afterEach, describe, expect, test, vi } from "vitest";
import { Computed } from "./computed.ts";
import { SignalWriteError } from "./errors.ts";
import { ReadonlySignal, Signal } from "./signal.ts";
import { Watch } from "./watch.ts";

describe("Signal", () => {
  test("holds its initial value", () => {
    expect(new Signal(5)
      .get())
      .toBe(5);
    expect(new Signal<string | undefined>(undefined)
      .get())
      .toBe(undefined);
  });

  test("set and update change the value", () => {
    const a = new Signal(1);
    a.set(2);
    expect(a.get())
      .toBe(2);
    a.update((n) => n + 1);
    expect(a.get())
      .toBe(3);
  });

  test("version increases only on real changes (Object.is by default)", () => {
    const a = new Signal(1);
    expect(a.version)
      .toBe(0);
    a.set(1);
    expect(a.version)
      .toBe(0);
    a.set(2);
    expect(a.version)
      .toBe(1);
    const n = new Signal(NaN);
    n.set(NaN);
    expect(n.version)
      .toBe(0);
  });

  test("custom equality: equal values are ignored entirely", () => {
    const user = new Signal({ id: 1, name: "Ada" }, (x, y) => x.id === y.id);
    user.set({ id: 1, name: "Changed" });
    expect(user.get().name)
      .toBe("Ada");
    expect(user.version)
      .toBe(0);
    user.set({ id: 2, name: "Grace" });
    expect(user.get().name)
      .toBe("Grace");
  });

  test("getUntracked does not make the reader depend on it", () => {
    const a = new Signal(1);
    const b = new Signal(10);
    let runs = 0;
    const c = new Computed(() => {
      runs++;
      return a.get() + b.getUntracked();
    });
    expect(c.get())
      .toBe(11);
    b.set(20);
    expect(c.get())
      .toBe(11);
    a.set(2);
    expect(c.get())
      .toBe(22);
    expect(runs)
      .toBe(2);
  });

  test("writing inside a computed throws SignalWriteError (even an equal value)", () => {
    const a = new Signal(0);
    const set = new Computed(() => {
      a.set(1);
      return 0;
    });
    const update = new Computed(() => {
      a.update((n) => n);
      return 0;
    });
    expect(() => set.get())
      .toThrow(SignalWriteError);
    expect(() => update.get())
      .toThrow(SignalWriteError);
    expect(a.get())
      .toBe(0);
  });

  test("writing inside a watch is allowed", () => {
    const a = new Signal(1);
    const doubled = new Signal(0);
    new Watch(() => doubled.set(a.get() * 2), { schedule: (task) => task.run() });
    a.set(5);
    expect(doubled.get())
      .toBe(10);
  });
});

describe("ReadonlySignal", () => {
  test("asReadonly returns one shared read-only view", () => {
    const a = new Signal(1);
    const view = a.asReadonly();
    expect(view)
      .toBeInstanceOf(ReadonlySignal);
    expect(a.asReadonly())
      .toBe(view);
    expect("set" in view)
      .toBe(false);
  });

  test("the view follows the signal, and reading it tracks the signal", () => {
    const a = new Signal(1);
    const view = a.asReadonly();
    const c = new Computed(() => view.get() * 10);
    expect(c.get())
      .toBe(10);
    a.set(2);
    expect(view.get())
      .toBe(2);
    expect(view.getUntracked())
      .toBe(2);
    expect(c.get())
      .toBe(20);
  });
});

describe("setting the object a signal holds", () => {
  const dev = globalThis as { __TINKER_DEV__?: boolean };
  afterEach(() => {
    delete dev.__TINKER_DEV__;
    vi.restoreAllMocks();
  });

  test("in a development build, warns once per signal: what reads it is not told", () => {
    dev.__TINKER_DEV__ = true;
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const list = new Signal<number[]>([1]);
    list.update((current) => {
      current.push(2);
      return current;
    });
    list.set(list.get());
    expect(warn)
      .toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0])
      .toContain("A signal was set to the object it already holds");
  });

  test("a new array, or the same primitive, is not warned about", () => {
    dev.__TINKER_DEV__ = true;
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const list = new Signal<number[]>([1]);
    list.set([...list.get(), 2]);
    const count = new Signal(1);
    count.set(1);
    expect(warn)
      .not
      .toHaveBeenCalled();
  });

  test("outside a development build, nothing is warned", () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const list = new Signal<number[]>([1]);
    list.set(list.get());
    expect(warn)
      .not
      .toHaveBeenCalled();
  });
});

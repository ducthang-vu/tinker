import { describe, expect, test } from "vitest";
import { Computed } from "../computed.ts";
import { Signal } from "../signal.ts";
import type { Consumer } from "../types.ts";
import { activeConsumer, countReads, tracked, untracked } from "./active-consumer.ts";
import { signal } from "../../signals.ts";

const fakeConsumer = (): Consumer => ({
  allowWrites: true,
  addDependency() {},
  markDirty() {},
});

describe("activeConsumer", () => {
  test("is null when nothing is reading", () => {
    expect(activeConsumer.get())
      .toBe(null);
  });
});

describe("@tracked", () => {
  class Probe implements Consumer {
    allowWrites = true;
    seen: Consumer | null = null;
    addDependency() {}
    markDirty() {}

    @tracked
    run(fail: boolean): string {
      this.seen = activeConsumer.get();
      if (fail) throw new Error("boom");
      return "done";
    }
  }

  test("makes `this` the active consumer and passes arguments and result through", () => {
    const probe = new Probe();
    expect(probe.run(false))
      .toBe("done");
    expect(probe.seen)
      .toBe(probe);
    expect(activeConsumer.get())
      .toBe(null);
  });

  test("restores the previous consumer even when the method throws", () => {
    const outer = fakeConsumer();
    activeConsumer.set(outer);
    try {
      expect(() => new Probe()
        .run(true))
        .toThrow("boom");
      expect(activeConsumer.get())
        .toBe(outer);
    } finally {
      activeConsumer.set(null);
    }
  });
});

describe("untracked", () => {
  test("returns the result and works outside any consumer", () => {
    expect(untracked(() => 42))
      .toBe(42);
  });

  test("reads inside are not dependencies of the surrounding computed", () => {
    const a = new Signal(1);
    const b = new Signal(10);
    let runs = 0;
    const c = new Computed(() => {
      runs++;
      return a.get() + untracked(() => b.get());
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

  test("restores the active consumer, even when fn throws", () => {
    const outer = fakeConsumer();
    activeConsumer.set(outer);
    try {
      expect(() =>
        untracked(() => {
          expect(activeConsumer.get())
            .toBe(null);
          throw new Error("x");
        }),
      )
        .toThrow("x");
      expect(activeConsumer.get())
        .toBe(outer);
    } finally {
      activeConsumer.set(null);
    }
  });
});

describe("countReads", () => {
  test("counts the signals a function reads, and gives its result", () => {
    const a = signal(1);
    const b = signal(2);
    const { value, reads } = countReads(() => a() + b());
    expect(value)
      .toBe(3);
    expect(reads)
      .toBe(2);
  });

  test("a function that reads nothing counts no reads", () => {
    expect(countReads(() => "text"))
      .toEqual({ value: "text", reads: 0 });
  });

  test("the counter is told when a signal it read changes, and then keeps counting nothing", () => {
    const a = signal(1);
    countReads(() => a());
    a.set(2);
    expect(a())
      .toBe(2);
  });
});

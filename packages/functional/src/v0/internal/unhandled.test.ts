import { describe, expect, test, vi } from "vitest";
import { reportUnhandled, withUnhandledReporter } from "./unhandled.ts";

describe("unhandled errors", () => {
  test("by default, they are re-thrown in a microtask, not where they are reported", async () => {
    const thrown: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (task) => original(() => {
      try {
        task();
      } catch (error) {
        thrown.push(error);
      }
    });
    try {
      const error = new Error("listener bug");
      expect(() => reportUnhandled(error))
        .not.toThrow();
      expect(thrown)
        .toEqual([]);
      await Promise.resolve();
      expect(thrown)
        .toEqual([error]);
    } finally {
      globalThis.queueMicrotask = original;
    }
  });

  test("withUnhandledReporter swaps the reporter for a call, and restores it, even if the call throws", () => {
    const reported: unknown[] = [];
    const reporter = vi.fn((error: unknown) => void reported.push(error));
    const result = withUnhandledReporter(reporter, () => {
      reportUnhandled("a");
      return "done";
    });
    expect(result)
      .toBe("done");
    expect(() => withUnhandledReporter(reporter, () => {
      throw new Error("inside");
    }))
      .toThrow("inside");
    withUnhandledReporter(() => {}, () => reportUnhandled("swallowed"));
    expect(reported)
      .toEqual(["a"]);
    // Restored: reporting outside goes to the default again, not to `reporter`.
    const original = globalThis.queueMicrotask;
    const queued: unknown[] = [];
    globalThis.queueMicrotask = (task) => void queued.push(task);
    try {
      reportUnhandled("after");
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(queued)
      .toHaveLength(1);
    expect(reported)
      .toEqual(["a"]);
  });
});

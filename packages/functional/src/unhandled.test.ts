import { describe, expect, test, vi } from "vitest";
import { reportUnhandled, withUnhandledReporter } from "./unhandled.ts";

describe("unhandled errors", () => {
  test("withUnhandledReporter sends the error to the replacement, and restores the previous reporter", () => {
    const reported: unknown[] = [];
    withUnhandledReporter((error) => reported.push(error), () => reportUnhandled("first"));
    expect(reported)
      .toEqual(["first"]);
  });

  test("the previous reporter is restored even when the function throws", () => {
    const outer: unknown[] = [];
    withUnhandledReporter((error) => outer.push(error), () => {
      expect(() => withUnhandledReporter(() => {}, () => {
        throw new Error("inside");
      }))
        .toThrow("inside");
      reportUnhandled("after");
    });
    expect(outer)
      .toEqual(["after"]);
  });

  test("by default an unhandled error is rethrown in a microtask", () => {
    const microtasks: Array<() => void> = [];
    const spy = vi.spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => {
        microtasks.push(task);
      });
    try {
      reportUnhandled(new Error("default"));
      expect(microtasks)
        .toHaveLength(1);
      expect(() => microtasks[0]!())
        .toThrow("default");
    } finally {
      spy.mockRestore();
    }
  });
});

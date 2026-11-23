import { describe, expect, test, vi } from "vitest";
import { devChecks } from "./scope.ts";

describe("devChecks", () => {
  test("warns with console.warn, and each message only once", () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const checks = devChecks();
    checks.warn("first");
    checks.warn("first");
    checks.warn("second");
    expect(warn.mock.calls)
      .toEqual([["first"], ["second"]]);
    warn.mockRestore();
  });
});

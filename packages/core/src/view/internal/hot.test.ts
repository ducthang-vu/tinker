import { describe, expect, test } from "vitest";
import { __tinkerHot, type HotModule } from "./hot.ts";

describe("__tinkerHot", () => {
  test("asks Vite to reload, until in-place updates are written", () => {
    let invalidated = 0;
    const hot: HotModule = {
      invalidate: () => {
        invalidated++;
      },
    };
    __tinkerHot(hot, "/app/page.ts", "abc", [["Page", {}]]);
    expect(invalidated)
      .toBe(1);
  });
});

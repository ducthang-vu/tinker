import { describe, expect, test } from "vitest";
import { booleanAdapter, numberAdapter } from "./input-adapters.ts";

describe("numberAdapter", () => {
  test("reads a number, ignoring spaces around it", () => {
    expect(numberAdapter("3"))
      .toBe(3);
    expect(numberAdapter("  2.5 "))
      .toBe(2.5);
  });

  test("an empty attribute or text that is not a number is an error", () => {
    expect(() => numberAdapter(""))
      .toThrow("\"\" is not a number");
    expect(() => numberAdapter("   "))
      .toThrow("is not a number");
    expect(() => numberAdapter("abc"))
      .toThrow("\"abc\" is not a number");
  });
});

describe("booleanAdapter", () => {
  test("a bare attribute and any value but \"false\" are true", () => {
    expect(booleanAdapter(""))
      .toBe(true);
    expect(booleanAdapter("open"))
      .toBe(true);
  });

  test("only \"false\" is false", () => {
    expect(booleanAdapter("false"))
      .toBe(false);
  });
});

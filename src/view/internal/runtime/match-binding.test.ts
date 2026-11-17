import { describe, expect, test } from "vitest";
import { parsePattern } from "../template/pattern.ts";
import { match } from "./match-binding.ts";

/** Whether `text` as a pattern matches `value`. */
function matches(text: string, value: unknown): boolean {
  return match(parsePattern(text)
    .getOrThrow(), value) !== undefined;
}

describe("match", () => {
  test("present matches anything but null and undefined", () => {
    expect(matches("present", 0))
      .toBe(true);
    expect(matches("present", null))
      .toBe(false);
    expect(matches("present", undefined))
      .toBe(false);
  });

  test("alternatives match when one option does", () => {
    expect(matches(`"loading" | "saving"`, "saving"))
      .toBe(true);
    expect(matches(`"loading" | "saving"`, "idle"))
      .toBe(false);
    expect(matches(`number | null`, null))
      .toBe(true);
  });

  test("a range matches the numbers from its smaller to its larger end, inclusive", () => {
    expect(matches("0..12", 0))
      .toBe(true);
    expect(matches("0..12", 12))
      .toBe(true);
    expect(matches("0..12", 13))
      .toBe(false);
    expect(matches("0..12", "5"))
      .toBe(false);
  });

  test("not matches what its pattern does not", () => {
    expect(matches(`not "guest"`, "ana"))
      .toBe(true);
    expect(matches(`not "guest"`, "guest"))
      .toBe(false);
  });

  test("absent alone never matches, since a value is not absent by itself", () => {
    expect(match({ kind: "absent" }, undefined))
      .toBeUndefined();
  });

  test("an absent key matches an object without the key, and only that", () => {
    expect(matches("{ error: absent }", {}))
      .toBe(true);
    expect(matches("{ error: absent }", { error: undefined }))
      .toBe(false);
    expect(matches("{ error: absent }", "not an object"))
      .toBe(false);
  });

  test("an array pattern with a rest needs at least its items", () => {
    expect(matches("[first, ...rest]", [1, 2]))
      .toBe(true);
    expect(matches("[first, ...rest]", []))
      .toBe(false);
    expect(matches("[first, ...rest]", "x"))
      .toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { Left, Right } from "./either.ts";
import { isEqual, match } from "./monad.ts";
import { None, Some } from "./maybe.ts";

describe("match", () => {
  test("an Either is handled by the handler named after its case, with its argument", () => {
    expect(match(Right.of(2), { Right: (value) => value * 10, Left: () => -1 }))
      .toBe(20);
    expect(match(Left.of("boom"), { Right: () => 0, Left: (error) => error.length }))
      .toBe(4);
  });

  test("a Maybe is handled by the handler named after its case: Some gets the value, None gets nothing", () => {
    expect(match(Some.of("x"), { Some: (value) => value + "!", None: () => "none" }))
      .toBe("x!");
    expect(match(None.of<string>(), { Some: (value) => value + "!", None: () => "none" }))
      .toBe("none");
  });
});

describe("isEqual", () => {
  test("boxes are equal only with the same case and equal arguments", () => {
    expect(isEqual(Right.of(1), Right.of(1)))
      .toBe(true);
    expect(isEqual(Right.of(1), Right.of(2)))
      .toBe(false);
    expect(isEqual(Right.of(1), Left.of(1)))
      .toBe(false);
    expect(isEqual(Some.of(1), None.of()))
      .toBe(false);
    expect(isEqual(None.of(), None.of()))
      .toBe(true);
  });

  test("the equal function compares the arguments", () => {
    expect(isEqual(Right.of("a"), Right.of("A"), (a, b) => String(a)
      .toLowerCase() === String(b)
      .toLowerCase()))
      .toBe(true);
  });
});

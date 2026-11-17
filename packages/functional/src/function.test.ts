import { describe, expect, expectTypeOf, test } from "vitest";
import { flip, partial } from "./function.ts";

describe("flip", () => {
  test("swaps the first two arguments", () => {
    const minus = (a: number, b: number) => a - b;
    expect(flip(minus)(1, 10))
      .toBe(9);
  });

  test("keeps the types of the swapped arguments", () => {
    const repeat = (text: string, times: number) => text.repeat(times);
    const flipped = flip(repeat);
    expectTypeOf(flipped)
      .toEqualTypeOf<(times: number, text: string) => string>();
    expect(flipped(2, "ab"))
      .toBe("abab");
  });
});

describe("partial", () => {
  test("fixes the first arguments and takes the rest", () => {
    const sum3 = (a: number, b: number, c: number) => a + b + c;
    expect(partial(sum3, 1, 2)(3))
      .toBe(6);
  });

  test("with no arguments given, it is the same function", () => {
    const join = (a: string, b: string) => `${a}${b}`;
    expect(partial(join)("x", "y"))
      .toBe("xy");
  });

  test("the result can be called more than once", () => {
    const power = (base: number, exponent: number) => base ** exponent;
    const square = partial(power, 2);
    expect([square(3), square(4)])
      .toEqual([8, 16]);
  });

  test("works with flip to fix the second argument", () => {
    const minus = (a: number, b: number) => a - b;
    const fromTen = partial(flip(minus), 10);
    expect(fromTen(3))
      .toBe(-7);
  });
});

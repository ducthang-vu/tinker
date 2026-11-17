import { describe, expect, expectTypeOf, test } from "vitest";
import { partial } from "./function.ts";

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
});

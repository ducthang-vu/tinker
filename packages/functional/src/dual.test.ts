import { describe, expect, test } from "vitest";
import { dual } from "./dual.ts";

/** A dual function: all of its arguments, or the second given later. */
interface Add {
  (a: number, b: number): number;
  (a: number): (b: number) => number;
}

/** A dual function, data-first or data-last. */
interface Times {
  (factor: number, value: number): number;
  (factor: number): (value: number) => number;
}

describe("dual", () => {
  const add = dual<Add>(2, (a: number, b: number) => a + b);

  test("with all its arguments, it runs at once (data-first)", () => {
    expect(add(1, 2))
      .toBe(3);
  });

  test("with fewer, it waits for the missing first argument (data-last)", () => {
    const addTwo = add(2);
    expect(addTwo(5))
      .toBe(7);
  });

  test("the data-last result is reusable and keeps its arguments", () => {
    const times = dual<Times>(2, (factor: number, value: number) => factor * value);
    const triple = times(3);
    expect([triple(2), triple(5)])
      .toEqual([6, 15]);
  });
});

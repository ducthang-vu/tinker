import { describe, expect, test } from "vitest";
import { pipe } from "./pipe.ts";

describe("pipe", () => {
  test("with no steps, returns the value", () => {
    expect(pipe(4))
      .toBe(4);
  });

  test("applies each step to the result of the one before, in order", () => {
    const result = pipe(
      2,
      (n: number) => n + 1,
      (n: number) => n * 10,
      (n: number) => `#${n}`,
    );
    expect(result)
      .toBe("#30");
  });

  test("takes up to ten steps", () => {
    const inc = (n: number) => n + 1;
    expect(pipe(0, inc, inc, inc, inc, inc, inc, inc, inc, inc, inc))
      .toBe(10);
  });
});

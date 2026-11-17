import { describe, expect, test } from "vitest";
import { flow, pipe } from "./pipe.ts";

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

describe("flow", () => {
  test("makes a function that runs the first step on its arguments, then the rest", () => {
    const length = flow(
      (text: string, extra: number) => text.repeat(extra),
      (text: string) => text.length,
    );
    expect(length("ab", 3))
      .toBe(6);
  });

  test("a single step is the step itself", () => {
    const double = flow((n: number) => n * 2);
    expect(double(21))
      .toBe(42);
  });

  test("takes up to ten steps, in order", () => {
    const up = (n: number) => n + 1;
    const eleven = flow(up, up, up, up, up, up, up, up, up, up, up);
    expect(eleven(0))
      .toBe(11);
  });
});

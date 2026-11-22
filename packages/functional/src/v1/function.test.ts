import { describe, expect, test } from "vitest";
import { Right, type Either } from "./either.ts";
import { flatMap, map } from "./functor.ts";
import { flow, pipe } from "./function.ts";

describe("pipe", () => {
  test("returns the value itself with no functions", () => {
    expect(pipe(3))
      .toBe(3);
  });

  test("applies each function to the result of the one before, left to right", () => {
    expect(pipe(2, (n: number) => n + 1, (n: number) => n * 10))
      .toBe(30);
  });

  test("passes an Either through data-last map and flatMap", () => {
    // The types are given: an overloaded data-last map is inferred from its last signature.
    const result = pipe<Either<number, string>, Either<number, string>, Either<number, string>>(
      Right.of<number, string>(2),
      map((n: number) => n + 1),
      flatMap((n: number) => Right.of<number, string>(n * 10)),
    );
    expect(result)
      .toEqual(Right.of(30));
  });
});

describe("flow", () => {
  test("makes a function that applies the steps in order", () => {
    const addThenDouble = flow((a: number, b: number) => a + b, (n: number) => n * 2);
    expect(addThenDouble(1, 2))
      .toBe(6);
  });

  test("with one function, it is that function", () => {
    const length = flow((text: string) => text.length);
    expect(length("abc"))
      .toBe(3);
  });

  test("composes with data-last map", () => {
    const addOne = flow(map((n: number) => n + 1));
    expect(addOne(Right.of<number, string>(1)))
      .toEqual(Right.of(2));
  });
});

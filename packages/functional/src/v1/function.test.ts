import { describe, expect, test } from "vitest";
import { Right, type Either } from "./either.ts";
import { Some, type Maybe } from "./maybe.ts";
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

  test("passes an Either through data-last map and flatMap, with no annotations", () => {
    const result = pipe(
      Right.of<number, string>(2),
      map((n: number) => n + 1),
      flatMap((n: number) => Right.of<number, string>(n * 10)),
    );
    // The type is inferred: this assignment fails to compile if it is not Either<number, string>.
    const typed: Either<number, string> = result;
    expect(typed)
      .toEqual(Right.of(30));
  });

  test("passes a Maybe through data-last map, with no annotations", () => {
    const result = pipe(Some.of(2), map((n: number) => n + 1));
    const typed: Maybe<number> = result;
    expect(typed)
      .toEqual(Some.of(3));
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

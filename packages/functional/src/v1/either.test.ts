import { describe, expect, test } from "vitest";
import { attempt, Left, Right, map, mapLeft, flatMap, toError, type Either } from "./either.ts";
import { match } from "./monad.ts";

const show = (e: Either<unknown, unknown>): string =>
  match(e, { Right: (value) => `right ${String(value)}`, Left: (error) => `left ${String(error)}` });

describe("Right and Left", () => {
  test("of builds each case, and match reads it", () => {
    expect(show(Right.of(1)))
      .toBe("right 1");
    expect(show(Left.of("e")))
      .toBe("left e");
  });
});

describe("map, flatMap and mapLeft, data-first and data-last", () => {
  test("map transforms a Right and keeps a Left", () => {
    expect(show(map(Right.of(2), (n: number) => n * 10)))
      .toBe("right 20");
    expect(show(map(Left.of("e"), (n: number) => n * 10)))
      .toBe("left e");
    expect(show(map((n: number) => n + 1)(Right.of(1))))
      .toBe("right 2");
  });

  test("flatMap chains a step that may fail", () => {
    const positive = (n: number) => (n > 0 ? Right.of<number, string>(n) : Left.of<string, number>("not positive"));
    expect(show(flatMap(Right.of(1), positive)))
      .toBe("right 1");
    expect(show(flatMap(Right.of(-1), positive)))
      .toBe("left not positive");
    expect(show(flatMap(Left.of("earlier"), positive)))
      .toBe("left earlier");
    expect(show(flatMap(positive)(Right.of(-1))))
      .toBe("left not positive");
  });

  test("mapLeft transforms a Left and keeps a Right", () => {
    expect(show(mapLeft(Left.of("e"), (error: string) => error.toUpperCase())))
      .toBe("left E");
    expect(show(mapLeft(Right.of(1), (error: string) => error.toUpperCase())))
      .toBe("right 1");
    expect(show(mapLeft((error: string) => error + "!")(Left.of("e"))))
      .toBe("left e!");
  });
});

describe("attempt", () => {
  const isError = (error: unknown): error is Error => error instanceof Error;

  test("a Right of the result when fn succeeds", () => {
    expect(show(attempt(() => 3, isError)))
      .toBe("right 3");
  });

  test("a Left of what fn threw when the predicate accepts it", () => {
    const failed = attempt(() => {
      throw new Error("bad");
    }, isError);
    expect(show(failed))
      .toBe("left Error: bad");
  });

  test("a throw the predicate rejects propagates: it is a bug", () => {
    expect(() => attempt(() => {
      throw "not an error";
    }, isError))
      .toThrow();
  });
});

describe("toError", () => {
  test("an Error is kept as it is, anything else is wrapped with its value as the cause", () => {
    const error = new Error("kept");
    expect(toError(error))
      .toBe(error);
    const wrapped = toError("text");
    expect(wrapped.message)
      .toBe("text");
    expect(wrapped.cause)
      .toBe("text");
  });
});

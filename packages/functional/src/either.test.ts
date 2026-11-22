import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { EDGE_VALUES } from "./testing.ts";
import { attempt, Left, mapLeft, Right, toError, type Either, valueOrThrow } from "./either.ts";
import { flatMap, map } from "./functor.ts";
import { isEqual, match } from "./monad.ts";

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

describe("Either on every edge value", () => {
  const cases = EDGE_VALUES.map((value) => [String(value), value] as const);
  const unwrapRight = (e: Either<unknown, unknown>) =>
    match(e, { Right: (x) => x, Left: () => NOT_A_VALUE });
  const unwrapLeft = (e: Either<unknown, unknown>) =>
    match(e, { Right: () => NOT_A_VALUE, Left: (x) => x });

  test.each(cases)("a Right of %s is matched as a Right, and map with the identity keeps it", (_, value) => {
    expect(Object.is(unwrapRight(map(Right.of(value), (x: unknown) => x)), value))
      .toBe(true);
  });

  test.each(cases)("flatMap with Right.of keeps a Right of %s", (_, value) => {
    expect(Object.is(unwrapRight(flatMap(Right.of(value), Right.of)), value))
      .toBe(true);
  });

  test.each(cases)("map composes on a Right of %s", (_, value) => {
    const f = (x: unknown) => [x];
    const g = (x: unknown) => ({ wrapped: x });
    const once = unwrapRight(map(map(Right.of(value), f), g));
    const fused = unwrapRight(map(Right.of(value), (x: unknown) => g(f(x))));
    expect(isDeepStrictEqual(once, fused))
      .toBe(true);
  });

  test.each(cases)("a Left holding %s is not changed by map or flatMap", (_, value) => {
    expect(Object.is(unwrapLeft(map(Left.of(value), (x: unknown) => x)), value))
      .toBe(true);
    expect(Object.is(unwrapLeft(flatMap(Left.of(value), Right.of)), value))
      .toBe(true);
  });

  test.each(cases)("mapLeft with the identity keeps a Left holding %s", (_, value) => {
    expect(Object.is(unwrapLeft(mapLeft(Left.of(value), (x: unknown) => x)), value))
      .toBe(true);
  });

  test.each(cases)("a Right of a Right of %s equals another, and not a Left", (_, value) => {
    expect(isEqual(Right.of(Right.of(value)), Right.of(Right.of(value))))
      .toBe(true);
    expect(isEqual(Right.of(Right.of(value)), Left.of(value)))
      .toBe(false);
  });

  test.each(cases)("match tells a Right of %s from a Left of it", (_, value) => {
    expect(match(Right.of(value), { Right: () => "Right", Left: () => "Left" }))
      .toBe("Right");
    expect(match(Left.of(value), { Right: () => "Right", Left: () => "Left" }))
      .toBe("Left");
  });
});

/** A marker for "no value", since every edge value is a value. */
const NOT_A_VALUE: unknown = Symbol("not a value");

describe("valueOrThrow", () => {
  test("returns the value of a Right", () => {
    expect(valueOrThrow(Right.of(3)))
      .toBe(3);
  });

  test("throws the error of a Left", () => {
    expect(() => valueOrThrow(Left.of(new Error("boom"))))
      .toThrow("boom");
  });
});

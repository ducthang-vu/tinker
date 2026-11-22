import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { EDGE_VALUES } from "./testing.ts";
import { Left, Right } from "./either.ts";
import { filter, fromEither, isNone, isSome, None, Some, toEither, type Maybe } from "./maybe.ts";
import { flatMap, map } from "./functor.ts";
import { isEqual, match } from "./monad.ts";

const show = (m: Maybe<unknown>): string =>
  match(m, { Some: (value) => `some ${String(value)}`, None: () => "none" });

describe("Some and None", () => {
  test("of builds each case, and match reads it", () => {
    expect(show(Some.of(1)))
      .toBe("some 1");
    expect(show(None.of()))
      .toBe("none");
  });
});

describe("map and flatMap, data-first and data-last", () => {
  test("map transforms a Some and keeps a None", () => {
    expect(show(map(Some.of(2), (n: number) => n * 10)))
      .toBe("some 20");
    expect(show(map(None.of<number>(), (n: number) => n * 10)))
      .toBe("none");
    expect(show(map((n: number) => n + 1)(Some.of(1))))
      .toBe("some 2");
  });

  test("flatMap chains a step that may produce nothing", () => {
    const positive = (n: number): Maybe<number> => (n > 0 ? Some.of(n) : None.of<number>());
    expect(show(flatMap(Some.of(1), positive)))
      .toBe("some 1");
    expect(show(flatMap(Some.of(-1), positive)))
      .toBe("none");
    expect(show(flatMap(None.of<number>(), positive)))
      .toBe("none");
    expect(show(flatMap(positive)(Some.of(-1))))
      .toBe("none");
  });
});

describe("filter, toEither, fromEither, isSome and isNone", () => {
  test("filter keeps a value the predicate accepts", () => {
    expect(show(filter(Some.of(4), (n) => n > 3)))
      .toBe("some 4");
    expect(show(filter(Some.of(2), (n) => n > 3)))
      .toBe("none");
    expect(show(filter(None.of<number>(), () => true)))
      .toBe("none");
  });

  test("toEither makes a Right of a Some and a Left of the error for a None", () => {
    expect(match(toEither(Some.of(1), "missing"), { Right: (value) => value, Left: () => -1 }))
      .toBe(1);
    expect(match(toEither(None.of<number>(), "missing"), { Right: () => 0, Left: (error) => error.length }))
      .toBe(7);
  });

  test("fromEither makes a Some of a Right and a None from a Left", () => {
    expect(show(fromEither(Right.of<number, string>(3))))
      .toBe("some 3");
    expect(show(fromEither(Left.of<string, number>("e"))))
      .toBe("none");
  });

  test("isSome and isNone tell the cases apart", () => {
    expect(isSome(Some.of(1)))
      .toBe(true);
    expect(isSome(None.of()))
      .toBe(false);
    expect(isNone(None.of()))
      .toBe(true);
    expect(isNone(Some.of(1)))
      .toBe(false);
  });
});

describe("Maybe on every edge value", () => {
  const cases = EDGE_VALUES.map((value) => [String(value), value] as const);

  test.each(cases)("a Some of %s is a Some, and map with the identity keeps it", (_, value) => {
    expect(isSome(Some.of(value)))
      .toBe(true);
    const kept = valueOf(map(Some.of(value), (x: unknown) => x));
    expect(Object.is(kept, value))
      .toBe(true);
  });

  test.each(cases)("flatMap with of keeps a Some of %s", (_, value) => {
    const chained = valueOf(flatMap(Some.of(value), Some.of));
    expect(Object.is(chained, value))
      .toBe(true);
  });

  test.each(cases)("map composes on a Some of %s", (_, value) => {
    const f = (x: unknown) => [x];
    const g = (x: unknown) => ({ wrapped: x });
    const once = valueOf(map(map(Some.of(value), f), g));
    const fused = valueOf(map(Some.of(value), (x: unknown) => g(f(x))));
    expect(isDeepStrictEqual(once, fused))
      .toBe(true);
  });

  test.each(cases)("a flatMap to None on a Some of %s gives None", (_, value) => {
    expect(isNone(flatMap(Some.of(value), () => None.of())))
      .toBe(true);
  });

  test.each(cases)("match picks the Some case of a Some of %s", (_, value) => {
    expect(match(Some.of(value), { Some: () => "Some", None: () => "None" }))
      .toBe("Some");
  });

  test.each(cases)("toEither of a Some of %s is a Right of it", (_, value) => {
    expect(match(toEither(Some.of(value), "missing"), { Right: (x) => x, Left: () => NOT_A_VALUE }))
      .toBe(value);
  });

  test.each(cases)("a Some of a Some of %s equals another, and not a None", (_, value) => {
    expect(isEqual(Some.of(Some.of(value)), Some.of(Some.of(value))))
      .toBe(true);
    expect(isEqual(Some.of(Some.of(value)), None.of()))
      .toBe(false);
  });

  test.each(cases)("filter keeps a Some of %s when the predicate accepts it", (_, value) => {
    expect(isSome(filter(Some.of(value), () => true)))
      .toBe(true);
    expect(isNone(filter(Some.of(value), () => false)))
      .toBe(true);
  });
});

/** A marker for "no value", since every edge value is a value. */
const NOT_A_VALUE: unknown = Symbol("not a value");

/** The value of a Some, or the marker for a None. */
const valueOf = (m: Maybe<unknown>): unknown =>
  match(m, { Some: (x) => x, None: () => NOT_A_VALUE });

import { describe, expect, test } from "vitest";
import { Left, Right } from "./either.ts";
import { filter, flatMap, fromEither, isNone, isSome, map, None, Some, toEither, type Maybe } from "./maybe.ts";
import { match } from "./monad.ts";

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

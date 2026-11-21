import { describe, expect, expectTypeOf, test } from "vitest";
import { Maybe } from "./maybe.ts";

/** Compare two Maybes by what they hold. */
const show = <T>(m: Maybe<T>) => m.match({ some: (v) => ["some", v], none: () => ["none"] });

describe("Maybe", () => {
  test("some, none and of", () => {
    expect(Maybe.some(1)
      .isSome())
      .toBe(true);
    expect(Maybe.none()
      .isNone())
      .toBe(true);
    expect(Maybe.none()
      .isSome())
      .toBe(false);
    expect(Maybe.some(1)
      .isNone())
      .toBe(false);
    expect(show(Maybe.some(2)))
      .toEqual(["some", 2]);
    expect(Maybe.none())
      .toBe(Maybe.none()); // one shared None
  });

  test("from: null and undefined are None, everything else is Some", () => {
    expect(Maybe.from(null)
      .isNone())
      .toBe(true);
    expect(Maybe.from(undefined)
      .isNone())
      .toBe(true);
    expect(show(Maybe.from(0)))
      .toEqual(["some", 0]);
    expect(show(Maybe.from("")))
      .toEqual(["some", ""]);
    expectTypeOf(Maybe.from("x" as string | null))
      .toEqualTypeOf<Maybe<string>>();
  });

  test("map transforms a Some and leaves None alone", () => {
    expect(show(Maybe.map(Maybe.some(2), (n) => n * 10)))
      .toEqual(["some", 20]);
    expect(show(Maybe.map(Maybe.none<number>(), (n) => n * 10)))
      .toEqual(["none"]);
  });

  test("flatMap chains, and None short-circuits", () => {
    const half = (n: number) => (n % 2 === 0 ? Maybe.some(n / 2) : Maybe.none<number>());
    expect(show(Maybe.flatMap(Maybe.flatMap(Maybe.some(8), half), half)))
      .toEqual(["some", 2]);
    expect(show(Maybe.flatMap(Maybe.flatMap(Maybe.some(6), half), half)))
      .toEqual(["none"]);
    let called = false;
    Maybe.flatMap(Maybe.none<number>(), (n) => ((called = true), Maybe.some(n)));
    expect(called)
      .toBe(false);
  });

  test("filter keeps a value only if the predicate accepts it", () => {
    expect(show(Maybe.some(4)
      .filter((n) => n > 3)))
      .toEqual(["some", 4]);
    expect(show(Maybe.some(2)
      .filter((n) => n > 3)))
      .toEqual(["none"]);
    expect(show(Maybe.none<number>()
      .filter(() => true)))
      .toEqual(["none"]);
  });

  test("getOrElse and toEither", () => {
    expect(Maybe.some(1)
      .getOrElse(0))
      .toBe(1);
    expect(Maybe.none<number>()
      .getOrElse(0))
      .toBe(0);
    expect(Maybe.some(1)
      .toEither("missing")
      .match({ left: () => -1, right: (value) => value }))
      .toBe(1);
    expect(Maybe.none<number>()
      .toEither("missing")
      .match({ left: (e) => e, right: String }))
      .toBe("missing");
  });

  test("filter with a type guard narrows the type", () => {
    const value: Maybe<unknown> = Maybe.some("text");
    const text: Maybe<string> = value.filter((v) => typeof v === "string");
    expect(text.getOrElse(""))
      .toBe("text");
    expect(Maybe.some(1 as unknown)
      .filter((v) => typeof v === "string")
      .isNone())
      .toBe(true);
  });

  test("getOrThrow returns the value, or throws the error it creates (only then)", () => {
    let created = 0;
    const makeError = () => (created++, new Error("missing"));
    expect(Maybe.some(1)
      .getOrThrow(makeError))
      .toBe(1);
    expect(created)
      .toBe(0);
    expect(() => Maybe.none()
      .getOrThrow(makeError))
      .toThrow("missing");
    expect(created)
      .toBe(1);
  });

  test("orElse keeps a Some, and asks the fallback only for a None", () => {
    let asked = 0;
    const fallback = () => (asked++, Maybe.some(0));
    expect(show(Maybe.some(1)
      .orElse(fallback)))
      .toEqual(["some", 1]);
    expect(asked)
      .toBe(0);
    expect(show(Maybe.none<number>()
      .orElse(fallback)))
      .toEqual(["some", 0]);
    expect(show(Maybe.none<number>()
      .orElse(() => Maybe.none())))
      .toEqual(["none"]);
  });

  test("ifSome runs the action only with a value", () => {
    const seen: number[] = [];
    Maybe.some(1)
      .ifSome((v) => seen.push(v));
    Maybe.none<number>()
      .ifSome((v) => seen.push(v));
    expect(seen)
      .toEqual([1]);
  });

  describe("monad laws", () => {
    const f = (n: number) => (n > 0 ? Maybe.some(n * 2) : Maybe.none<number>());
    const g = (n: number) => Maybe.some(`#${n}`);
    const values = [Maybe.some(3), Maybe.some(-1), Maybe.none<number>()];

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) expect(show(Maybe.flatMap(Maybe.some(a), f)))
        .toEqual(show(f(a)));
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of values) expect(show(Maybe.flatMap(m, Maybe.some)))
        .toEqual(show(m));
    });
    test("associativity", () => {
      for (const m of values) {
        expect(show(Maybe.flatMap(Maybe.flatMap(m, f), g)))
          .toEqual(show(Maybe.flatMap(m, (x) => Maybe.flatMap(f(x), g))));
      }
    });
  });
});

describe("isEqual compares the content", () => {
  test("two None are equal, and None is not equal to a Some", () => {
    expect(Maybe.none()
      .isEqual(Maybe.none()))
      .toBe(true);
    expect(Maybe.none<number>()
      .isEqual(Maybe.some(1)))
      .toBe(false);
    expect(Maybe.some(1)
      .isEqual(Maybe.none<number>()))
      .toBe(false);
  });

  test("two Some are equal when their values are equal, by === unless a comparator is given", () => {
    expect(Maybe.some(1)
      .isEqual(Maybe.some(1)))
      .toBe(true);
    expect(Maybe.some(1)
      .isEqual(Maybe.some(2)))
      .toBe(false);
    const byId = (a: { id: number }, b: { id: number }) => a.id === b.id;
    expect(Maybe.some({ id: 1 })
      .isEqual(Maybe.some({ id: 1 }), byId))
      .toBe(true);
    expect(Maybe.some({ id: 1 })
      .isEqual(Maybe.some({ id: 1 })))
      .toBe(false);
  });
});

import { describe, expect, expectTypeOf, test } from "vitest";
import { Maybe } from "./maybe.ts";

/** Compare two Maybes by what they hold. */
const show = <T>(m: Maybe<T>) => m.match({ some: (v) => ["some", v], none: () => ["none"] });

describe("Maybe", () => {
  test("some, none and of", () => {
    expect(Maybe.some(1).isSome()).toBe(true);
    expect(Maybe.none().isNone()).toBe(true);
    expect(Maybe.none().isSome()).toBe(false);
    expect(Maybe.some(1).isNone()).toBe(false);
    expect(show(Maybe.of(2))).toEqual(["some", 2]);
    expect(Maybe.none()).toBe(Maybe.none()); // one shared None
  });

  test("fromNullable: null and undefined are None, everything else is Some", () => {
    expect(Maybe.fromNullable(null).isNone()).toBe(true);
    expect(Maybe.fromNullable(undefined).isNone()).toBe(true);
    expect(show(Maybe.fromNullable(0))).toEqual(["some", 0]);
    expect(show(Maybe.fromNullable(""))).toEqual(["some", ""]);
    expectTypeOf(Maybe.fromNullable("x" as string | null)).toEqualTypeOf<Maybe<string>>();
  });

  test("map transforms a Some and leaves None alone", () => {
    expect(show(Maybe.some(2).map((n) => n * 10))).toEqual(["some", 20]);
    expect(show(Maybe.none<number>().map((n) => n * 10))).toEqual(["none"]);
  });

  test("flatMap chains, and None short-circuits", () => {
    const half = (n: number) => (n % 2 === 0 ? Maybe.some(n / 2) : Maybe.none<number>());
    expect(show(Maybe.some(8).flatMap(half).flatMap(half))).toEqual(["some", 2]);
    expect(show(Maybe.some(6).flatMap(half).flatMap(half))).toEqual(["none"]);
    let called = false;
    Maybe.none<number>().flatMap((n) => ((called = true), Maybe.some(n)));
    expect(called).toBe(false);
  });

  test("filter keeps a value only if the predicate accepts it", () => {
    expect(show(Maybe.some(4).filter((n) => n > 3))).toEqual(["some", 4]);
    expect(show(Maybe.some(2).filter((n) => n > 3))).toEqual(["none"]);
    expect(show(Maybe.none<number>().filter(() => true))).toEqual(["none"]);
  });

  test("getOrElse and toEither", () => {
    expect(Maybe.some(1).getOrElse(0)).toBe(1);
    expect(Maybe.none<number>().getOrElse(0)).toBe(0);
    expect(Maybe.some(1).toEither("missing").getOrElse(-1)).toBe(1);
    expect(Maybe.none<number>().toEither("missing").match({ left: (e) => e, right: String })).toBe("missing");
  });

  describe("monad laws", () => {
    const f = (n: number) => (n > 0 ? Maybe.some(n * 2) : Maybe.none<number>());
    const g = (n: number) => Maybe.some(`#${n}`);
    const values = [Maybe.some(3), Maybe.some(-1), Maybe.none<number>()];

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) expect(show(Maybe.of(a).flatMap(f))).toEqual(show(f(a)));
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of values) expect(show(m.flatMap(Maybe.of))).toEqual(show(m));
    });
    test("associativity", () => {
      for (const m of values) {
        expect(show(m.flatMap(f).flatMap(g))).toEqual(show(m.flatMap((x) => f(x).flatMap(g))));
      }
    });
  });
});

import { describe, expect, test } from "vitest";
import { Right } from "./either.ts";
import { CHAIN, type Chain, type Functor, flatMap, MAP, map } from "./functor.ts";
import { MATCHABLE, type Matchable } from "./monad.ts";

/** A functor that is not matchable: it maps itself under the MAP protocol. */
class Tagged<T> implements Functor<T> {
  constructor(
    readonly label: string,
    readonly value: T,
  ) {}

  [MAP]<U>(f: (value: T) => U): Tagged<U> {
    return new Tagged(this.label, f(this.value));
  }
}

describe("the MAP protocol", () => {
  test("map uses the value's own MAP method, with no registration", () => {
    const result = map(new Tagged("t", 2), (n: number) => n * 10);
    expect(result)
      .toEqual(new Tagged("t", 20));
  });

  test("the data-last map applies the value's own MAP method", () => {
    const addOne = map((n: number) => n + 1);
    expect(addOne(new Tagged("t", 1)))
      .toEqual(new Tagged("t", 2));
  });

  test("a matchable box with no MAP method is still mapped through the registry", () => {
    expect(map(Right.of(1), (n: number) => n + 1))
      .toEqual(Right.of(2));
  });

  test("a value with a MAP property that is not a function is not a functor", () => {
    const notAFunctor = { [MAP]: 1 } as unknown as Matchable;
    expect(() => map(notAFunctor, (value: unknown) => value))
      .toThrow("map needs a functor");
  });

  test("a plain object is neither a functor nor matchable", () => {
    expect(() => map({ value: 1 } as unknown as Matchable, (value: unknown) => value))
      .toThrow("map needs a functor (a value with the MAP method) or a matchable box");
  });

  test("null and primitives are neither a functor nor matchable", () => {
    expect(() => map(null as unknown as Matchable, (value: unknown) => value))
      .toThrow("map needs a functor");
    expect(() => map(1 as unknown as Matchable, (value: unknown) => value))
      .toThrow("map needs a functor");
  });

  test("a matchable box is recognised by its MATCHABLE record", () => {
    const box = { [MATCHABLE]: { name: "Unregistered", args: [1] } } as unknown as Matchable;
    expect(() => map(box, (value: unknown) => value))
      .toThrow("map is not implemented for the case Unregistered");
  });
});

/** A chain that is not matchable: it chains itself under the CHAIN protocol. */
class Boxed<T> implements Chain<T> {
  constructor(readonly value: T) {}

  [CHAIN]<U>(f: (value: T) => Chain<U>): Chain<U> {
    return f(this.value);
  }
}

describe("the CHAIN protocol", () => {
  test("flatMap uses the value's own CHAIN method, with no registration", () => {
    const result = flatMap(new Boxed(2), (n: number) => new Boxed(n * 10));
    expect(result)
      .toEqual(new Boxed(20));
  });

  test("the data-last flatMap applies the value's own CHAIN method", () => {
    const addOne = flatMap((n: number) => new Boxed(n + 1));
    expect(addOne(new Boxed(1)))
      .toEqual(new Boxed(2));
  });

  test("a matchable Right is still chained through the registry", () => {
    expect(flatMap(Right.of(1), (n: number) => Right.of(n + 1)))
      .toEqual(Right.of(2));
  });

  test("a value with a CHAIN property that is not a function is not a chain", () => {
    const notAChain = { [CHAIN]: 1 } as unknown as Matchable;
    expect(() => flatMap(notAChain, (value: unknown) => notAChain))
      .toThrow("flatMap needs a chain");
  });

  test("a plain object, null and a primitive are neither a chain nor matchable", () => {
    const identity = (value: unknown) => value as Matchable;
    expect(() => flatMap({ value: 1 } as unknown as Matchable, identity))
      .toThrow("flatMap needs a chain (a value with the CHAIN method) or a matchable box");
    expect(() => flatMap(null as unknown as Matchable, (value: unknown) => value as Matchable))
      .toThrow("flatMap needs a chain");
    expect(() => flatMap(1 as unknown as Matchable, (value: unknown) => value as Matchable))
      .toThrow("flatMap needs a chain");
  });
});

/** A value that is both a functor and a chain: a monad that is not matchable. */
class Both<T> implements Functor<T>, Chain<T> {
  constructor(readonly value: T) {}

  [MAP]<U>(f: (value: T) => U): Both<U> {
    return new Both(f(this.value));
  }

  [CHAIN]<U>(f: (value: T) => Chain<U>): Chain<U> {
    return f(this.value);
  }
}

describe("a functor that is also a chain", () => {
  test("it is an argument of map, data-first and data-last", () => {
    expect(map(new Both(2), (n: number) => n + 1))
      .toEqual(new Both(3));
    expect(map((n: number) => n + 1)(new Both(2)))
      .toEqual(new Both(3));
  });

  test("it is an argument of flatMap, data-first and data-last", () => {
    expect(flatMap(new Both(2), (n: number) => new Both(n + 1)))
      .toEqual(new Both(3));
    expect(flatMap((n: number) => new Both(n + 1))(new Both(2)))
      .toEqual(new Both(3));
  });
});

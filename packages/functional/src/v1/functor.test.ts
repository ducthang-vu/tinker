import { describe, expect, test } from "vitest";
import { Right } from "./either.ts";
import { type Functor, MAP, map } from "./functor.ts";
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

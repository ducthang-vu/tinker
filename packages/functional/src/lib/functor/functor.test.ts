import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { Left, Right } from "../monad/either.ts";
import { CHAIN, type Chain, type Functor, flatMap, MAP, map, sequence } from "./functor.ts";
import { MATCHABLE, type Matchable } from "../monad/monad.ts";
import { chainLaws, type ChainUnderTest, EDGE_VALUES } from "../../testing.ts";

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

describe("native arrays", () => {
  test("map applies f to each element, data-first and data-last", () => {
    expect(map([1, 2], (n: number) => n * 2))
      .toEqual([2, 4]);
    expect(map((n: number) => n * 2)([1, 2]))
      .toEqual([2, 4]);
  });

  test("flatMap concatenates the arrays f returns, data-first and data-last", () => {
    expect(flatMap([1, 2], (n: number) => [n, n]))
      .toEqual([1, 1, 2, 2]);
    expect(flatMap((n: number) => [n, n])([1, 2]))
      .toEqual([1, 1, 2, 2]);
  });

  test("an empty array maps and chains to an empty array", () => {
    expect(map([], (n: number) => n))
      .toEqual([]);
    expect(flatMap([], (n: number) => [n]))
      .toEqual([]);
  });

  test("the edge values survive map and flatMap unchanged", () => {
    expect(map(EDGE_VALUES, (value) => value))
      .toEqual(EDGE_VALUES);
    expect(flatMap(EDGE_VALUES, (value) => [value]))
      .toEqual(EDGE_VALUES);
  });

  test("an array of Eithers maps each Either", () => {
    const eithers = [Right.of<number, string>(1), Left.of<string, number>("bad")];
    expect(map(eithers, (either) => map(either, (n: number) => n + 1)))
      .toEqual([Right.of(2), Left.of("bad")]);
  });

  test("an array is a chain: its flatMap obeys the chain laws on every edge value", () => {
    const arrays: ChainUnderTest<unknown[], unknown> = {
      name: "Array",
      samples: [[], [0], [1, 2], [null, undefined], [NaN], EDGE_VALUES.slice(0, 5)],
      values: EDGE_VALUES,
      of: (value) => [value],
      flatMap: (box, f) => flatMap(box, (value) => f(value) as unknown[]),
      equal: (a, b) => isDeepStrictEqual(a, b),
      step: (value) => [value],
      nextStep: (value) => [value, value],
    };
    for (const [description, check] of chainLaws(arrays)) {
      expect(check, description)
        .not.toThrow();
    }
  });
});

describe("sequence", () => {
  test("a list of Rights is a Right of their values, in order", () => {
    expect(sequence([Right.of<number, string>(1), Right.of<number, string>(2)]))
      .toEqual(Right.of([1, 2]));
  });

  test("the first Left is the result", () => {
    expect(sequence([Right.of<number, string>(1), Left.of<string, number>("bad"), Left.of<string, number>("worse")]))
      .toEqual(Left.of("bad"));
  });

  test("an empty list is a Right of an empty list", () => {
    expect(sequence<number, string>([]))
      .toEqual(Right.of([]));
  });
});

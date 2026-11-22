import { describe, expect, test } from "vitest";
import { Right, type Either } from "./monad/either.ts";
import { None, Some, type Maybe } from "./monad/maybe.ts";
import { type Functor, MAP } from "./functor/functor.ts";
import { implementMap } from "./functor/registry.ts";
import { MATCHABLE, type Matchable } from "./monad/monad.ts";
import { Stream, run } from "./stream/stream.ts";
import { flatMap, map } from "./functor/functor.ts";
import { flow, partial, pipe } from "./function.ts";

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

describe("pipe with every kind of box, no annotations", () => {
  test("a Maybe through data-last flatMap infers Maybe", () => {
    const positive = (n: number) => (n > 0 ? Some.of(n) : None.of<number>());
    const result = pipe(Some.of(2), flatMap(positive));
    const typed: Maybe<number> = result;
    expect(typed)
      .toEqual(Some.of(2));
  });

  test("a Maybe through data-last map and flatMap infers Maybe", () => {
    const result = pipe(
      Some.of(2),
      map((n: number) => n + 1),
      flatMap((n: number) => Some.of(n * 10)),
    );
    const typed: Maybe<number> = result;
    expect(typed)
      .toEqual(Some.of(30));
  });

  test("an array through data-last map and flatMap infers an array", () => {
    const result = pipe([1, 2], map((n: number) => n * 2), flatMap((n: number) => [n, n]));
    const typed: number[] = result;
    expect(typed)
      .toEqual([2, 2, 4, 4]);
  });

  test("a stream through data-last map infers a stream of the mapped end", () => {
    const stream = Stream.end(1);
    const result = pipe(stream, map((n: number) => n + 1));
    const typed: Stream<never, number, Error> = result;
    const seen: number[] = [];
    run(typed, { ok: (value) => seen.push(value) });
    expect(seen)
      .toEqual([2]);
  });

  test("a user functor through data-last map infers a Functor of the mapped value", () => {
    class Tagged implements Functor<number> {
      constructor(readonly value: number) {}

      [MAP]<U>(f: (value: number) => U): Tagged & Functor<U> {
        return new Tagged(this.value) as unknown as Tagged & Functor<U>;
      }
    }
    const result = pipe(new Tagged(2), map((n: number) => n + 1));
    const typed: Functor<number> = result;
    expect(typed)
      .toBeDefined();
  });

  test("a registered matchable case through data-last map infers Matchable", () => {
    implementMap("PipeCase", (box, f) => ({ [MATCHABLE]: { name: "PipeCase", args: [f(box[MATCHABLE].args[0])] } }));
    const box: Matchable = { [MATCHABLE]: { name: "PipeCase", args: [1] } };
    const result = pipe(box, map((n: number) => n + 1));
    const typed: Matchable = result;
    expect(typed[MATCHABLE])
      .toEqual({ name: "PipeCase", args: [2] });
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

describe("partial", () => {
  test("fixes the first arguments, and takes the rest", () => {
    const sum3 = (a: number, b: number, c: number) => a + b + c;
    expect(partial(sum3, 1, 2)(3))
      .toBe(6);
    expect(partial(sum3)(1, 2, 3))
      .toBe(6);
    expect(partial(sum3, 1, 2, 3)())
      .toBe(6);
  });
});

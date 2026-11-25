import { describe, expect, test } from "vitest";
import { Right, type Either } from "./monad/either.ts";
import { None, Some, type Maybe } from "./monad/maybe.ts";
import { type Functor, MAP } from "./functor/functor.ts";
import { implementMap } from "./functor/registry.ts";
import { MATCHABLE, type Matchable } from "./monad/monad.ts";
import { Stream, run } from "./stream/stream.ts";
import { flatMap, map } from "./functor/functor.ts";
import { flow, memoise, partial, pipe } from "./function.ts";

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

  test("a registered matchable case through data-first map infers Matchable", () => {
    implementMap("PipeCase", (box, f) => ({ [MATCHABLE]: { name: "PipeCase", args: [f(box[MATCHABLE].args[0])] } }));
    const box: Matchable = { [MATCHABLE]: { name: "PipeCase", args: [1] } };
    const result = map(box, (n: number) => n + 1);
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

describe("data-last map annotations", () => {
  test("a parameter annotation that does not match the box is a type error", () => {
    // @ts-expect-error the box holds a string, so a number parameter does not fit
    const wrong = pipe(Some.of("a"), map((n: number) => n + 1));
    expect(wrong)
      .toBeDefined();
  });

  test("a parameter annotation that matches the box is accepted", () => {
    const right = pipe(Some.of("ab"), map((text: string) => text.length));
    expect(right)
      .toEqual(Some.of(2));
  });
});

describe("memoise", () => {
  test("calls the function once for the same arguments, and gives the same result", () => {
    let calls = 0;
    const double = memoise((n: number) => (calls++, n * 2));
    expect(double(3))
      .toBe(6);
    expect(double(3))
      .toBe(6);
    expect(calls)
      .toBe(1);
  });

  test("calls the function again when an argument differs", () => {
    let calls = 0;
    const double = memoise((n: number) => (calls++, n * 2));
    expect(double(3))
      .toBe(6);
    expect(double(4))
      .toBe(8);
    expect(calls)
      .toBe(2);
  });

  test("keeps only the last call: an earlier argument is calculated again", () => {
    let calls = 0;
    const double = memoise((n: number) => (calls++, n * 2));
    double(1);
    double(2);
    double(1);
    expect(calls)
      .toBe(3);
  });

  test("compares arguments by identity: an equal object that is a new one is calculated again", () => {
    let calls = 0;
    const size = memoise((items: readonly number[]) => (calls++, items.length));
    expect(size([1, 2]))
      .toBe(2);
    expect(size([1, 2]))
      .toBe(2);
    expect(calls)
      .toBe(2);
  });

  test("treats NaN as equal to NaN, as Object.is does", () => {
    let calls = 0;
    const show = memoise((n: number) => (calls++, String(n)));
    show(Number.NaN);
    show(Number.NaN);
    expect(calls)
      .toBe(1);
  });

  test("compares every argument, and a call with fewer arguments is a different call", () => {
    let calls = 0;
    const add = memoise((a: number, b?: number) => (calls++, a + (b ?? 10)));
    expect(add(1, 2))
      .toBe(3);
    expect(add(1, 2))
      .toBe(3);
    expect(add(1))
      .toBe(11);
    expect(calls)
      .toBe(2);
  });

  test("with no arguments, the function is called once", () => {
    let calls = 0;
    const once = memoise(() => (calls++, "value"));
    once();
    expect(once())
      .toBe("value");
    expect(calls)
      .toBe(1);
  });

  test("if the function throws, nothing is kept: the next call calls it again", () => {
    let fail = true;
    const read = memoise((n: number) => {
      if (fail) throw new Error("not yet");
      return n;
    });
    expect(() => read(1))
      .toThrow("not yet");
    fail = false;
    expect(read(1))
      .toBe(1);
  });
});

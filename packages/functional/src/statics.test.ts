import { describe, expect, test } from "vitest";
import { Either } from "./either.ts";
import { Maybe } from "./maybe.ts";
import { pipe } from "./pipe.ts";
import { Stream } from "./stream.ts";
import { Task } from "./task.ts";

describe("Maybe.map and Maybe.flatMap, in both call forms", () => {
  test("data-first runs at once, data-last waits for a value in pipe", () => {
    expect(Maybe.map(Maybe.some(2), (n: number) => n + 1)
      .getOrElse(0))
      .toBe(3);
    expect(pipe(
      Maybe.some(2),
      Maybe.map((n: number) => n + 1),
      Maybe.flatMap((n) => Maybe.some(n * 2)),
    )
      .getOrElse(0))
      .toBe(6);
    expect(pipe(Maybe.none<number>(), Maybe.flatMap((n: number) => Maybe.some(n)))
      .isNone())
      .toBe(true);
  });
});

describe("Either.map and Either.flatMap, in both call forms", () => {
  test("keeps the error type through a pipe", () => {
    const result = pipe(
      Either.right<number, string>(2),
      Either.map((n: number) => n + 1),
      Either.flatMap((n: number) => (n > 2 ? Either.left<number, string>("big") : Either.right(n))),
    );
    expect(result.isLeft())
      .toBe(true);
    expect(Either.map(Either.right<number, string>(1), (n: number) => n * 4)
      .getOrElse(0))
      .toBe(4);
  });
});

describe("Task.map and Task.flatMap, in both call forms", () => {
  test("data-first and data-last give the same outcome", () => {
    const inc = (n: number) => Task.succeed(n + 1);
    const outcomes: unknown[] = [];
    const observe = (task: Task<number, Error>) => task.run({
      ok: (value) => outcomes.push(value),
      error: (error) => outcomes.push(error),
    });
    observe(Task.flatMap(Task.succeed(1), inc));
    observe(pipe(Task.succeed(1), Task.flatMap(inc)));
    observe(pipe(Task.succeed(2), Task.map((n: number) => n * 3)));
    expect(outcomes)
      .toEqual([2, 2, 6]);
  });
});

describe("Stream.map and Stream.flatMap, in both call forms", () => {
  test("maps the end data-first and data-last", () => {
    const direct = Stream.map(Stream.end(1), (n: number) => n + 1);
    const piped = pipe(Stream.end(1), Stream.map((n: number) => n + 1));
    expect(direct)
      .toBeInstanceOf(Stream);
    expect(piped)
      .toBeInstanceOf(Stream);
  });

  test("flatMap runs a stream of the end, data-first and data-last", () => {
    const next = (n: number) => Stream.end(n + 1);
    expect(Stream.flatMap(Stream.end(1), next))
      .toBeInstanceOf(Stream);
    expect(pipe(Stream.end(1), Stream.flatMap(next)))
      .toBeInstanceOf(Stream);
  });
});

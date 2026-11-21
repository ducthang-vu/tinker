import { describe, expect, expectTypeOf, test } from "vitest";
import { Either, type EitherError } from "./either.ts";
import { pipe } from "./pipe.ts";

const show = <E, T>(e: Either<T, E>): unknown[] => e.match<unknown[]>({ left: (l) => ["left", l], right: (r) => ["right", r] });

describe("Either", () => {
  test("right, left and of", () => {
    expect(Either.right(1)
      .isRight())
      .toBe(true);
    expect(Either.right(1)
      .isLeft())
      .toBe(false);
    expect(Either.left("e")
      .isLeft())
      .toBe(true);
    expect(Either.left("e")
      .isRight())
      .toBe(false);
    expect(show(Either.right(2)))
      .toEqual(["right", 2]);
  });

  test("tryCatch: a result is a Right, a thrown error a Left", () => {
    expect(show(Either.tryCatch(() => JSON.parse("{\"a\":1}"))))
      .toEqual(["right", { a: 1 }]);
    const failed = Either.tryCatch(() => JSON.parse("{"));
    expect(failed.isLeft())
      .toBe(true);
    expect(failed.match({ left: (e) => e instanceof SyntaxError, right: () => false }))
      .toBe(true);
  });

  test("map transforms a Right, mapLeft a Left", () => {
    expect(show(Either.map(Either.right<number, string>(2), (n) => n * 10)))
      .toEqual(["right", 20]);
    expect(show(Either.map(Either.left<number, string>("e"), (n) => n * 10)))
      .toEqual(["left", "e"]);
    expect(show(Either.left<number, string>("e")
      .mapLeft((e) => e.toUpperCase())))
      .toEqual(["left", "E"]);
    expect(show(Either.right<number, string>(2)
      .mapLeft((e) => e.toUpperCase())))
      .toEqual(["right", 2]);
  });

  test("flatMap chains, a Left short-circuits, and error types add up", () => {
    const positive = (n: number): Either<number, "negative"> => (n >= 0 ? Either.right(n) : Either.left("negative"));
    const even = (n: number): Either<number, "odd"> => (n % 2 === 0 ? Either.right(n) : Either.left("odd"));
    const checked = Either.flatMap(Either.flatMap(Either.right<number, never>(4), positive), even);
    expectTypeOf(checked)
      .toEqualTypeOf<Either<number, "negative" | "odd">>();
    expect(show(checked))
      .toEqual(["right", 4]);
    expect(show(Either.flatMap(Either.flatMap(Either.right(-2), positive), even)))
      .toEqual(["left", "negative"]);
    expect(show(Either.flatMap(Either.flatMap(Either.right(3), positive), even)))
      .toEqual(["left", "odd"]);
  });

  test("getOrElse and toMaybe", () => {
    expect(Either.right(1)
      .getOrElse(0))
      .toBe(1);
    expect(Either.left<number, string>("e")
      .getOrElse(0))
      .toBe(0);
    expect(Either.right(1)
      .toMaybe()
      .getOrElse(0))
      .toBe(1);
    expect(Either.left<number, string>("e")
      .toMaybe()
      .isNone())
      .toBe(true);
  });

  describe("monad laws", () => {
    const f = (n: number): Either<number, string> => (n > 0 ? Either.right(n * 2) : Either.left("not positive"));
    const g = (n: number): Either<string, string> => Either.right(`#${n}`);
    const values: Either<number, string>[] = [Either.right(3), Either.right(-1), Either.left("e")];

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) expect(show(Either.flatMap(Either.right(a), f)))
        .toEqual(show(f(a)));
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of values) expect(show(Either.flatMap(m, (x) => Either.right(x))))
        .toEqual(show(m));
    });
    test("associativity", () => {
      for (const m of values) {
        expect(show(Either.flatMap(Either.flatMap(m, f), g)))
          .toEqual(show(Either.flatMap(m, (x) => Either.flatMap(f(x), g))));
      }
    });
  });
});

describe("EitherError", () => {
  test("from keeps a thrown Error as is", () => {
    const error = new TypeError("bad");
    const result = Either.from(() => {
      throw error;
    });
    expectTypeOf(result)
      .toEqualTypeOf<EitherError<never>>();
    expect(result.match({ left: (e) => e, right: () => null }))
      .toBe(error);
  });

  test("from wraps anything else in an Error, keeping it as the cause", () => {
    const result = Either.from(() => {
      throw "oops";
    });
    const error = result.match({ left: (e) => e, right: () => null })!;
    expect(error)
      .toBeInstanceOf(Error);
    expect(error.message)
      .toBe("oops");
    expect(error.cause)
      .toBe("oops");
  });

  test("from gives a Right when nothing is thrown", () => {
    expect(Either.from(() => 42)
      .getOrThrow())
      .toBe(42);
  });

  test("from runs a throwing call into an EitherError", () => {
    const parsed = Either.from(() => JSON.parse("{\"a\":1}") as unknown);
    expectTypeOf(parsed)
      .toEqualTypeOf<EitherError<unknown>>();
    expect(parsed.getOrThrow())
      .toEqual({ a: 1 });
    expect(Either.from(() => JSON.parse("{") as unknown)
      .isLeft())
      .toBe(true);
  });

  test("flatMap chains steps, each a from, without nested try/catch", () => {
    const read = (text: string) => Either.from(() => JSON.parse(text) as { port?: unknown });
    const port = (config: { port?: unknown }) => Either.from(() => {
      if (typeof config.port !== "number") throw new Error("port must be a number");
      return config.port;
    });
    expect(pipe(Either.right<string, Error>("{\"port\":8080}"), Either.flatMap(read), Either.flatMap(port))
      .getOrThrow())
      .toBe(8080);
    expect(() => pipe(Either.right<string, Error>("{\"port\":\"x\"}"), Either.flatMap(read), Either.flatMap(port))
      .getOrThrow())
      .toThrow("port must be a number");
  });

  test("map and flatMap keep it an EitherError", () => {
    const result = Either.flatMap(Either.map(Either.from(() => 2), (n) => n * 10), (n) => Either.from(() => `${n}`));
    expectTypeOf(result)
      .toEqualTypeOf<EitherError<string>>();
    expect(result.getOrThrow())
      .toBe("20");
  });

  test("getOrThrow throws the failure, and only exists when it is an Error", () => {
    const failed: EitherError<number> = Either.left(new Error("failed"));
    expect(() => failed.getOrThrow())
      .toThrow("failed");
    const notAnError = Either.left<number, string>("just a string");
    // @ts-expect-error getOrThrow needs the failure to be an Error
    const call = () => notAnError.getOrThrow();
    void call;
  });
});

describe("isEqual compares the content", () => {
  test("the same side with equal payloads is equal", () => {
    expect(Either.right(1)
      .isEqual(Either.right(1)))
      .toBe(true);
    expect(Either.left("no")
      .isEqual(Either.left("no")))
      .toBe(true);
    expect(Either.right(1)
      .isEqual(Either.right(2)))
      .toBe(false);
  });

  test("a left and a right are never equal", () => {
    const right: Either<number, number> = Either.right(1);
    expect(right
      .isEqual(Either.left(1)))
      .toBe(false);
  });

  test("the payloads are compared with the comparator, when one is given", () => {
    const byLength = (a: unknown, b: unknown) => String(a).length === String(b).length;
    expect(Either.right("ab")
      .isEqual(Either.right("cd"), byLength))
      .toBe(true);
  });
});

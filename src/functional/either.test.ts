import { describe, expect, expectTypeOf, test } from "vitest";
import { Either, type EitherError } from "./either.ts";

const show = <E, T>(e: Either<E, T>): unknown[] => e.match<unknown[]>({ left: (l) => ["left", l], right: (r) => ["right", r] });

describe("Either", () => {
  test("right, left and of", () => {
    expect(Either.right(1).isRight()).toBe(true);
    expect(Either.right(1).isLeft()).toBe(false);
    expect(Either.left("e").isLeft()).toBe(true);
    expect(Either.left("e").isRight()).toBe(false);
    expect(show(Either.of(2))).toEqual(["right", 2]);
  });

  test("tryCatch: a result is a Right, a thrown error a Left", () => {
    expect(show(Either.tryCatch(() => JSON.parse('{"a":1}')))).toEqual(["right", { a: 1 }]);
    const failed = Either.tryCatch(() => JSON.parse("{"));
    expect(failed.isLeft()).toBe(true);
    expect(failed.match({ left: (e) => e instanceof SyntaxError, right: () => false })).toBe(true);
  });

  test("map transforms a Right, mapLeft a Left", () => {
    expect(show(Either.right<number, string>(2).map((n) => n * 10))).toEqual(["right", 20]);
    expect(show(Either.left<string, number>("e").map((n) => n * 10))).toEqual(["left", "e"]);
    expect(show(Either.left<string, number>("e").mapLeft((e) => e.toUpperCase()))).toEqual(["left", "E"]);
    expect(show(Either.right<number, string>(2).mapLeft((e) => e.toUpperCase()))).toEqual(["right", 2]);
  });

  test("flatMap chains, a Left short-circuits, and error types add up", () => {
    const positive = (n: number): Either<"negative", number> => (n >= 0 ? Either.right(n) : Either.left("negative"));
    const even = (n: number): Either<"odd", number> => (n % 2 === 0 ? Either.right(n) : Either.left("odd"));
    const checked = Either.of<number, never>(4).flatMap(positive).flatMap(even);
    expectTypeOf(checked).toEqualTypeOf<Either<"negative" | "odd", number>>();
    expect(show(checked)).toEqual(["right", 4]);
    expect(show(Either.of(-2).flatMap(positive).flatMap(even))).toEqual(["left", "negative"]);
    expect(show(Either.of(3).flatMap(positive).flatMap(even))).toEqual(["left", "odd"]);
  });

  test("getOrElse and toMaybe", () => {
    expect(Either.right(1).getOrElse(0)).toBe(1);
    expect(Either.left<string, number>("e").getOrElse(0)).toBe(0);
    expect(Either.right(1).toMaybe().getOrElse(0)).toBe(1);
    expect(Either.left<string, number>("e").toMaybe().isNone()).toBe(true);
  });

  describe("monad laws", () => {
    const f = (n: number): Either<string, number> => (n > 0 ? Either.right(n * 2) : Either.left("not positive"));
    const g = (n: number): Either<string, string> => Either.right(`#${n}`);
    const values: Either<string, number>[] = [Either.right(3), Either.right(-1), Either.left("e")];

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      for (const a of [3, -1]) expect(show(Either.of(a).flatMap(f))).toEqual(show(f(a)));
    });
    test("right identity: m.flatMap(of) = m", () => {
      for (const m of values) expect(show(m.flatMap((x) => Either.of(x)))).toEqual(show(m));
    });
    test("associativity", () => {
      for (const m of values) {
        expect(show(m.flatMap(f).flatMap(g))).toEqual(show(m.flatMap((x) => f(x).flatMap(g))));
      }
    });
  });
});

describe("EitherError", () => {
  test("tryCatchError keeps a thrown Error as is", () => {
    const error = new TypeError("bad");
    const result = Either.tryCatchError(() => {
      throw error;
    });
    expectTypeOf(result).toEqualTypeOf<EitherError<never>>();
    expect(result.match({ left: (e) => e, right: () => null })).toBe(error);
  });

  test("tryCatchError wraps anything else in an Error, keeping it as the cause", () => {
    const result = Either.tryCatchError(() => {
      throw "oops";
    });
    const error = result.match({ left: (e) => e, right: () => null })!;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("oops");
    expect(error.cause).toBe("oops");
  });

  test("tryCatchError gives a Right when nothing is thrown", () => {
    expect(Either.tryCatchError(() => 42).getOrThrow()).toBe(42);
  });

  test("lift turns a throwing function into one returning an EitherError", () => {
    const parse = Either.lift((text: string) => JSON.parse(text) as unknown);
    expectTypeOf(parse).toEqualTypeOf<(text: string) => EitherError<unknown>>();
    expect(parse('{"a":1}').getOrThrow()).toEqual({ a: 1 });
    expect(parse("{").isLeft()).toBe(true);
  });

  test("lift chains steps without nested try/catch", () => {
    const parse = Either.lift((text: string) => JSON.parse(text) as { port?: unknown });
    const port = Either.lift((config: { port?: unknown }) => {
      if (typeof config.port !== "number") throw new Error("port must be a number");
      return config.port;
    });
    expect(Either.right<string, Error>('{"port":8080}').flatMap(parse).flatMap(port).getOrThrow()).toBe(8080);
    expect(() => Either.right<string, Error>('{"port":"x"}').flatMap(parse).flatMap(port).getOrThrow()).toThrow(
      "port must be a number",
    );
  });

  test("map and flatMap keep it an EitherError", () => {
    const result = Either.tryCatchError(() => 2)
      .map((n) => n * 10)
      .flatMap((n) => Either.tryCatchError(() => `${n}`));
    expectTypeOf(result).toEqualTypeOf<EitherError<string>>();
    expect(result.getOrThrow()).toBe("20");
  });

  test("getOrThrow throws the failure, and only exists when it is an Error", () => {
    const failed: EitherError<number> = Either.left(new Error("failed"));
    expect(() => failed.getOrThrow()).toThrow("failed");
    const notAnError = Either.left<string, number>("just a string");
    // @ts-expect-error getOrThrow needs the failure to be an Error
    const call = () => notAnError.getOrThrow();
    void call;
  });
});

// Either<T, E>: a Right holding a T, or a Left holding an E. What the client puts in the Left is
// the client's choice. Each case is a class with a private constructor: build a case with
// `Right.of(value)` or `Left.of(error)`, and read a value only with `match`.

import { MONAD, match, type Identity, type Monad } from "./monad.ts";

/** A Right: a success, holding a T. */
export class Right<T> implements Monad<"Right", readonly [T]> {
  readonly [MONAD]: Identity<"Right", readonly [T]>;

  private constructor(value: T) {
    this[MONAD] = { name: "Right", args: [value] };
  }

  /** A success. */
  static of<T, E = never>(value: T): Either<T, E> {
    return new Right<T>(value);
  }
}

/** A Left: a failure, holding whatever the caller chose to put there. */
export class Left<E> implements Monad<"Left", readonly [E]> {
  readonly [MONAD]: Identity<"Left", readonly [E]>;

  private constructor(error: E) {
    this[MONAD] = { name: "Left", args: [error] };
  }

  /** A failure. */
  static of<E, T = never>(error: E): Either<T, E> {
    return new Left<E>(error);
  }
}

/** Either: a Right holding a T, or a Left holding an E. */
export type Either<T, E> = Right<T> | Left<E>;

/** The two handlers of a match, named after the cases. */
export type EitherCases<T, E, R> = {
  readonly Right: (value: T) => R;
  readonly Left: (error: E) => R;
};

/** `map`: data-first `map(e, f)`, or data-last `map(f)` for `pipe`. */
export function map<T, E, U>(self: Either<T, E>, f: (value: T) => U): Either<U, E>;
export function map<T, U>(f: (value: T) => U): <E>(self: Either<T, E>) => Either<U, E>;
export function map(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => unknown];
    return (self: Either<unknown, unknown>) => map(self, f);
  }
  const [self, f] = args as [Either<unknown, unknown>, (value: unknown) => unknown];
  return match<unknown, unknown, Either<unknown, unknown>>(self, {
    Right: (value) => Right.of(f(value)),
    Left: () => self,
  });
}

/** `flatMap`: data-first `flatMap(e, f)`, or data-last `flatMap(f)` for `pipe`. */
export function flatMap<T, E, U, F>(
  self: Either<T, E>,
  f: (value: T) => Either<U, F>,
): Either<U, E | F>;
export function flatMap<T, U, F>(
  f: (value: T) => Either<U, F>,
): <E>(self: Either<T, E>) => Either<U, E | F>;
export function flatMap(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => Either<unknown, unknown>];
    return (self: Either<unknown, unknown>) => flatMap(self, f);
  }
  const [self, f] = args as [
    Either<unknown, unknown>,
    (value: unknown) => Either<unknown, unknown>,
  ];
  return match<unknown, unknown, Either<unknown, unknown>>(self, {
    Right: (value) => f(value),
    Left: () => self,
  });
}

/** `mapLeft`: data-first `mapLeft(e, f)`, or data-last `mapLeft(f)` for `pipe`. */
export function mapLeft<T, E, F>(self: Either<T, E>, f: (error: E) => F): Either<T, F>;
export function mapLeft<E, F>(f: (error: E) => F): <T>(self: Either<T, E>) => Either<T, F>;
export function mapLeft(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(error: unknown) => unknown];
    return (self: Either<unknown, unknown>) => mapLeft(self, f);
  }
  const [self, f] = args as [Either<unknown, unknown>, (error: unknown) => unknown];
  return match<unknown, unknown, Either<unknown, unknown>>(self, {
    Right: () => self,
    Left: (error) => Left.of(f(error)),
  });
}

/**
 * Run `fn`: a Right of its result, or a Left of what it throws when `isExpected` accepts it.
 * Any other throw is a bug, and it propagates.
 */
export function attempt<T, E>(
  fn: () => T,
  isExpected: (error: unknown) => error is E,
): Either<T, E> {
  try {
    return Right.of<T, E>(fn());
  } catch (error) {
    if (isExpected(error)) {
      return Left.of<E, T>(error);
    }
    throw error;
  }
}

/** `value` as an Error: an Error as is, anything else wrapped (kept as its `cause`). */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

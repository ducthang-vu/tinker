// Either<T, E>: a Right holding a T, or a Left holding an E. What the client puts in the Left is
// the client's choice. Each case is a class with a private constructor: build a case with
// `Right.of(value)` or `Left.of(error)`, and read a value only with `match`.

import {
  EQUALS,
  equalCases,
  MATCHABLE,
  match,
  type Case,
  type Equatable,
  type Matchable,
} from "./monad.ts";

/** A Right: a success, holding a T. */
export class Right<T> implements Matchable<"Right", readonly [T]>, Equatable {
  readonly [MATCHABLE]: Case<"Right", readonly [T]>;

  /**
   * Creates the case. Use `Right.of` instead.
   *
   * @param value The value the Right holds.
   */
  private constructor(value: T) {
    this[MATCHABLE] = { name: "Right", args: [value] };
  }

  /**
   * Whether `other` is a Right holding an equal value.
   *
   * @param other The value to compare with.
   * @returns `true` when `other` is a Right whose value is equal to this one's.
   */
  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /**
   * A success.
   *
   * @param value The value the Right holds.
   * @returns A Right holding `value`.
   */
  static of<T, E = never>(value: T): Either<T, E> {
    return new Right<T>(value);
  }
}

/** A Left: a failure, holding whatever the caller chose to put there. */
export class Left<E> implements Matchable<"Left", readonly [E]>, Equatable {
  readonly [MATCHABLE]: Case<"Left", readonly [E]>;

  /**
   * Creates the case. Use `Left.of` instead.
   *
   * @param error The error the Left holds.
   */
  private constructor(error: E) {
    this[MATCHABLE] = { name: "Left", args: [error] };
  }

  /**
   * Whether `other` is a Left holding an equal error.
   *
   * @param other The value to compare with.
   * @returns `true` when `other` is a Left whose error is equal to this one's.
   */
  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /**
   * A failure.
   *
   * @param error The error the Left holds.
   * @returns A Left holding `error`.
   */
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

/**
 * `mapLeft`: data-first `mapLeft(e, f)`, or data-last `mapLeft(f)` for `pipe`.
 *
 * @param self The Either to map.
 * @param f The function applied to a Left's error.
 * @returns A Right unchanged, or a Left of `f`'s result.
 */
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

// Passes an error the caller did not expect through: the description says so, so there is no
// @throws for it.
// eslint-disable-next-line jsdoc/require-throws -- a pass-through, documented in the description
/**
 * Run `fn`: a Right of its result, or a Left of what it throws when `isExpected` accepts it.
 * Any other throw is a bug, and it propagates.
 *
 * @param fn The function to run.
 * @param isExpected Tells the errors the caller expects, which become a Left.
 * @returns A Right of `fn`'s result, or a Left of the expected error it threw.
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

/**
 * `value` as an Error: an Error as is, anything else wrapped (kept as its `cause`).
 *
 * @param value The thrown or rejected value.
 * @returns `value` itself when it is an Error, otherwise a new Error whose cause is `value`.
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

/**
 * The value of a Right. A Left throws its error: this is the one place a predictable error is
 * thrown, at the edge of an API that has no way to return it (use it only there).
 *
 * @param either The Either to read.
 * @returns The value of the Right.
 * @throws The error of the Left.
 */
export function valueOrThrow<T, E>(either: Either<T, E>): T {
  return match<T, E, T>(either, {
    Left: (error) => {
      throw error;
    },
    Right: (value) => value,
  });
}

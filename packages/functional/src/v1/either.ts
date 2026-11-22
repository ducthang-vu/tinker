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

  private constructor(value: T) {
    this[MATCHABLE] = { name: "Right", args: [value] };
  }

  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /** A success. */
  static of<T, E = never>(value: T): Either<T, E> {
    return new Right<T>(value);
  }
}

/** A Left: a failure, holding whatever the caller chose to put there. */
export class Left<E> implements Matchable<"Left", readonly [E]>, Equatable {
  readonly [MATCHABLE]: Case<"Left", readonly [E]>;

  private constructor(error: E) {
    this[MATCHABLE] = { name: "Left", args: [error] };
  }

  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
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

/** An Either as plain data, for code that acts on its outcome: read it, then branch on it. */
export type Outcome<T, E>
  = | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "failed"; readonly error: E };

/**
 * The outcome of an Either as plain data. It is `match` used to read a value: the branching that
 * acts on the outcome is left to ordinary code.
 *
 * @example
 * ```ts
 * const outcome = outcomeOf(Right.of(1));
 * if (outcome.kind === "ok") console.log(outcome.value);
 * ```
 */
export function outcomeOf<T, E>(either: Either<T, E>): Outcome<T, E> {
  return match<T, E, Outcome<T, E>>(either, {
    Right: (value) => ({ kind: "ok", value }),
    Left: (error) => ({ kind: "failed", error }),
  });
}

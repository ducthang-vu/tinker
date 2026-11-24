// Maybe<T>: a Some holding a value, or a None holding nothing. Read a value only with `match`.
//
//   match(maybe, { Some: (value) => ..., None: () => ... })

import { Right, Left, type Either } from "./either.ts";
import { Continue, OUTCOME, type Outcome } from "./outcome.ts";
import {
  EQUALS,
  equalCases,
  MATCHABLE,
  match,
  type Case,
  type Equatable,
  type Matchable,
} from "./monad.ts";

/** A Some: a value is present. */
export class Some<T> implements Matchable<"Some", readonly [T]>, Equatable {
  readonly [MATCHABLE]: Case<"Some", readonly [T]>;

  /**
   * Creates the case. Use `Some.of` instead.
   *
   * @param value The value the Some holds.
   */
  private constructor(value: T) {
    this[MATCHABLE] = { name: "Some", args: [value] };
  }

  /**
   * Whether `other` is a Some holding an equal value.
   *
   * @param other The value to compare with.
   * @returns `true` when `other` is a Some whose value is equal to this one's.
   */
  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /**
   * A present value.
   *
   * @param value The value the Some holds.
   * @returns A Some holding `value`.
   */
  static of<T>(value: T): Maybe<T> {
    return new Some<T>(value);
  }
}

/** A None: no value. */
export class None implements Matchable<"None", readonly []>, Equatable {
  readonly [MATCHABLE]: Case<"None", readonly []>;

  /** Creates the case. Use `None.of` instead. */
  private constructor() {
    this[MATCHABLE] = { name: "None", args: [] };
  }

  /**
   * Whether `other` is a None.
   *
   * @param other The value to compare with.
   * @returns `true` when `other` is a None.
   */
  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /**
   * No value.
   *
   * @returns A None.
   */
  static of<T = never>(): Maybe<T> {
    return new None();
  }
}

/** Maybe: a Some holding a T, or a None. */
export type Maybe<T> = Some<T> | None;

/** The two handlers of a match, named after the cases. */
export type MaybeCases<T, R> = {
  readonly Some: (value: T) => R;
  readonly None: () => R;
};

/**
 * Keep the value only if `predicate` accepts it.
 *
 * @param self The Maybe to filter.
 * @param predicate Tells whether a Some's value is kept.
 * @returns `self` when it is a Some whose value passes, otherwise a None.
 */
export function filter<T>(self: Maybe<T>, predicate: (value: T) => boolean): Maybe<T> {
  return match<T, Maybe<T>>(self, {
    Some: (value) => (predicate(value) ? self : None.of<T>()),
    None: () => self,
  });
}

/**
 * `Right(value)` for a Some, `Left(error)` for a None.
 *
 * @param self The Maybe to convert.
 * @param error The error the Left holds, for a None.
 * @returns A Right of the value, or a Left of `error`.
 */
export function toEither<T, E>(self: Maybe<T>, error: E): Either<T, E> {
  return match<T, Either<T, E>>(self, {
    Some: (value) => Right.of<T, E>(value),
    None: () => Left.of<E, T>(error),
  });
}

/**
 * `Some(value)` for a Right, `None` for a Left (its content is dropped).
 *
 * @param self The Either to convert.
 * @returns A Some of the Right's value, or a None.
 */
export function fromEither<T, E>(self: Either<T, E>): Maybe<T> {
  return match<T, E, Maybe<T>>(self, {
    Right: (value) => Some.of(value),
    Left: () => None.of<T>(),
  });
}

/**
 * Whether `self` is a Some.
 *
 * @param self The Maybe to check.
 * @returns `true` for a Some, `false` for a None.
 */
export function isSome<T>(self: Maybe<T>): boolean {
  return match(self, { Some: () => true, None: () => false });
}

/**
 * Whether `self` is a None.
 *
 * @param self The Maybe to check.
 * @returns `true` for a None, `false` for a Some.
 */
export function isNone<T>(self: Maybe<T>): boolean {
  return match(self, { Some: () => false, None: () => true });
}

/**
 * A Some of `value`, or a None when `value` is null or undefined.
 *
 * @param value The value that may be missing.
 * @returns A Some holding `value`, or a None when it is null or undefined.
 */
export function fromNullable<T>(value: T | null | undefined): Maybe<NonNullable<T>> {
  return value === null || value === undefined
    ? None.of<NonNullable<T>>()
    : Some.of<NonNullable<T>>(value);
}

/**
 * The value of a Some. A None throws `makeError()`: this is the one place a missing value is
 * thrown, at the edge of an API that has no way to return it (use it only there).
 *
 * @param self The Maybe to read.
 * @param makeError Makes the error to throw, for a None.
 * @returns The value of the Some.
 * @throws The error `makeError` returns, for a None.
 */
export function getOrThrow<T>(self: Maybe<T>, makeError: () => unknown): T {
  return match<T, T>(self, {
    Some: (value) => value,
    None: () => {
      throw makeError();
    },
  });
}

/**
 * The value of a Some, or `fallback` for a None.
 *
 * @param self The Maybe to read.
 * @param fallback The value to use for a None.
 * @returns The value of the Some, or `fallback`.
 */
export function getOrElse<T, U>(self: Maybe<T>, fallback: U): T | U {
  return match<T, T | U>(self, { Some: (value) => value, None: () => fallback });
}

/**
 * `self` if it is a Some, or else what `other` gives.
 *
 * @param self The Maybe to keep when it is a Some.
 * @param other Makes the Maybe to use for a None.
 * @returns `self` for a Some, otherwise the Maybe `other` returns.
 */
export function orElse<T, U>(self: Maybe<T>, other: () => Maybe<U>): Maybe<T | U> {
  return match<T, Maybe<T | U>>(self, { Some: () => self, None: () => other() });
}

/**
 * A Maybe from any outcome: a Continue becomes Some holding its value, and a Halt becomes None.
 * The reason of a Halt is lost, because None holds no value.
 *
 * @param outcome Any value that implements the outcome protocol.
 * @returns Some holding the value, or None.
 */
export function createMaybe<T, E>(outcome: Outcome<T, E>): Maybe<T> {
  const form = outcome[OUTCOME]();
  return form instanceof Continue ? Some.of(form.value) : None.of<T>();
}

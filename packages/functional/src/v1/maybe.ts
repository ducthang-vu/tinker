// Maybe<T>: a Some holding a value, or a None holding nothing. Read a value only with `match`.
//
//   match(maybe, { Some: (value) => ..., None: () => ... })

import { Right, Left, type Either } from "./either.ts";
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

  private constructor(value: T) {
    this[MATCHABLE] = { name: "Some", args: [value] };
  }

  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /** A present value. */
  static of<T>(value: T): Maybe<T> {
    return new Some<T>(value);
  }
}

/** A None: no value. */
export class None implements Matchable<"None", readonly []>, Equatable {
  readonly [MATCHABLE]: Case<"None", readonly []>;

  private constructor() {
    this[MATCHABLE] = { name: "None", args: [] };
  }

  [EQUALS](other: unknown): boolean {
    return equalCases(this, other);
  }

  /** No value. */
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

/** `map`: data-first `map(m, f)`, or data-last `map(f)` for `pipe`. */
export function map<T, U>(self: Maybe<T>, f: (value: T) => U): Maybe<U>;
export function map<T, U>(f: (value: T) => U): (self: Maybe<T>) => Maybe<U>;
export function map(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => unknown];
    return (self: Maybe<unknown>) => map(self, f);
  }
  const [self, f] = args as [Maybe<unknown>, (value: unknown) => unknown];
  return match<unknown, Maybe<unknown>>(self, {
    Some: (value) => Some.of(f(value)),
    None: () => self,
  });
}

/** `flatMap`: data-first `flatMap(m, f)`, or data-last `flatMap(f)` for `pipe`. */
export function flatMap<T, U>(self: Maybe<T>, f: (value: T) => Maybe<U>): Maybe<U>;
export function flatMap<T, U>(f: (value: T) => Maybe<U>): (self: Maybe<T>) => Maybe<U>;
export function flatMap(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => Maybe<unknown>];
    return (self: Maybe<unknown>) => flatMap(self, f);
  }
  const [self, f] = args as [Maybe<unknown>, (value: unknown) => Maybe<unknown>];
  return match<unknown, Maybe<unknown>>(self, {
    Some: (value) => f(value),
    None: () => self,
  });
}

/** Keep the value only if `predicate` accepts it. */
export function filter<T>(self: Maybe<T>, predicate: (value: T) => boolean): Maybe<T> {
  return match<T, Maybe<T>>(self, {
    Some: (value) => (predicate(value) ? self : None.of<T>()),
    None: () => self,
  });
}

/** `Right(value)` for a Some, `Left(error)` for a None. */
export function toEither<T, E>(self: Maybe<T>, error: E): Either<T, E> {
  return match<T, Either<T, E>>(self, {
    Some: (value) => Right.of<T, E>(value),
    None: () => Left.of<E, T>(error),
  });
}

/** `Some(value)` for a Right, `None` for a Left (its content is dropped). */
export function fromEither<T, E>(self: Either<T, E>): Maybe<T> {
  return match<T, E, Maybe<T>>(self, {
    Right: (value) => Some.of(value),
    Left: () => None.of<T>(),
  });
}

/** Whether `self` is a Some. */
export function isSome<T>(self: Maybe<T>): boolean {
  return match(self, { Some: () => true, None: () => false });
}

/** Whether `self` is a None. */
export function isNone<T>(self: Maybe<T>): boolean {
  return match(self, { Some: () => false, None: () => true });
}

// Maybe<T>: a value that may be absent (Some) or not (None).
//
// Like Either and Task, it is a monad with the same vocabulary:
//   Maybe.of(a)      unit: wrap a value (a Some)
//   maybe.map(f)     transform the value, if there is one
//   maybe.flatMap(f) chain a step that may itself produce nothing
//   maybe.match({ some, none })  get out, handling both cases
//
//   Maybe.fromNullable(user.address)
//     .map((address) => address.city)
//     .getOrElse("unknown");

import { Either } from "./either.ts";

export class Maybe<T> {
  private static readonly NONE = new Maybe<never>(false, undefined as never);

  private constructor(
    private readonly present: boolean,
    private readonly value: T,
  ) {}

  /** A present value. */
  static some<T>(value: T): Maybe<T> {
    return new Maybe(true, value);
  }

  /** No value. */
  static none<T = never>(): Maybe<T> {
    return Maybe.NONE;
  }

  /** Unit (the monad's `return`): the same as `some`. */
  static of<T>(value: T): Maybe<T> {
    return Maybe.some(value);
  }

  /** `None` for `null` or `undefined`, otherwise `Some(value)`. */
  static fromNullable<T>(value: T | null | undefined): Maybe<NonNullable<T>> {
    return value === null || value === undefined ? Maybe.none() : Maybe.some(value as NonNullable<T>);
  }

  isSome(): boolean {
    return this.present;
  }

  isNone(): boolean {
    return !this.present;
  }

  /** Transform the value, if there is one. */
  map<U>(f: (value: T) => U): Maybe<U> {
    return this.present ? Maybe.some(f(this.value)) : Maybe.none();
  }

  /** Chain a step that may itself produce nothing (the monad's bind). */
  flatMap<U>(f: (value: T) => Maybe<U>): Maybe<U> {
    return this.present ? f(this.value) : Maybe.none();
  }

  /** Keep the value only if `predicate` accepts it. */
  filter(predicate: (value: T) => boolean): Maybe<T> {
    return this.present && predicate(this.value) ? this : Maybe.none();
  }

  /** Get out of the Maybe, handling both cases. */
  match<R>(cases: { readonly some: (value: T) => R; readonly none: () => R }): R {
    return this.present ? cases.some(this.value) : cases.none();
  }

  /** The value, or `fallback` if there is none. */
  getOrElse<U>(fallback: U): T | U {
    return this.present ? this.value : fallback;
  }

  /** `Right(value)`, or `Left(error)` if there is none. */
  toEither<E>(error: E): Either<E, T> {
    return this.present ? Either.right(this.value) : Either.left(error);
  }
}

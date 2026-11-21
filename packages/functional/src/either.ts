// Either<T, E>: a success (Right, holding a T) or a failure (Left, holding
// an E). By convention "right" is the correct result.
//
// Like Maybe and Task, it is a monad with the same vocabulary:
//   Either.right(a)  wrap a value (a Right)
//   Either.map(e, f)  transform the success, if it is one, or Either.map(f) in a pipe
//   Either.flatMap(e, f)  chain a step that may itself fail
//   either.match({ left, right })  get out, handling both cases
//
//   pipe(
//     Either.try(() => JSON.parse(text)).mapLeft(toError),
//     Either.flatMap(validate),
//   ).match({ left: showError, right: render });

import { Maybe } from "./maybe.ts";
import { dual } from "./dual.ts";

/** `Either.map`: data-first `map(e, f)`, or data-last `map(f)` for `pipe`. */
export interface EitherMap {
  <E, T, U>(self: Either<T, E>, f: (value: T) => U): Either<U, E>;
  <T, U>(f: (value: T) => U): <E>(self: Either<T, E>) => Either<U, E>;
}

/** `Either.flatMap`: data-first `flatMap(e, f)`, or data-last `flatMap(f)` for `pipe`. */
export interface EitherFlatMap {
  <E, T, F, U>(self: Either<T, E>, f: (value: T) => Either<U, F>): Either<U, E | F>;
  <T, F, U>(f: (value: T) => Either<U, F>): <E>(self: Either<T, E>) => Either<U, E | F>;
}

/** An Either that is a success: where `isRight()` said yes, its value is `value()`. */
export type Right<T> = Either<T, never>;

/** An Either that is a failure: where `isLeft()` said yes, its error is `error()`. */
export type Left<E> = Either<never, E>;

/**
 * `value` as an Error: an Error as is, anything else wrapped (kept as its
 * `cause`). Used wherever something that was thrown becomes a failure value.
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

export class Either<T, E> {
  static readonly map: EitherMap = dual<EitherMap>(
    2,
    (self: Either<unknown, unknown>, f: (value: unknown) => unknown) => self.map(f),
  );

  static readonly flatMap: EitherFlatMap = dual<EitherFlatMap>(
    2,
    (self: Either<unknown, unknown>, f: (value: unknown) => Either<unknown, unknown>) =>
      self.flatMap(f),
  );

  private constructor(
    private readonly isRightSide: boolean,
    private readonly payload: E | T,
  ) {}

  /** A success. */
  static right<T, E = never>(value: T): Either<T, E> {
    return new Either<T, E>(true, value);
  }

  /** A failure. */
  static left<T = never, E = never>(error: E): Either<T, E> {
    return new Either<T, E>(false, error);
  }

  /** Run `fn`: its result as a Right, or what it throws as a Left. */
  static try<T>(fn: () => T): Either<T, unknown> {
    try {
      return Either.right(fn());
    } catch (error) {
      return Either.left(error);
    }
  }

  /**
   * Whether this is a success. After `if (!x.isRight()) return ...`, `x` is a Right
   * for the rest of the function, so `x.value()` is typed.
   */
  isRight(): this is Right<T> {
    return this.isRightSide;
  }

  /** Whether this is a failure. */
  isLeft(): this is Left<E> {
    return !this.isRightSide;
  }

  /** The success value. Callable once `isRight()` has said yes. */
  value(this: Right<T>): T {
    return this.payload as T;
  }

  /** The error. Callable once `isLeft()` has said yes. */
  error(this: Left<E>): E {
    return this.payload as E;
  }

  /**
   * The failure, as the early return of a function whose success type is `U`. Call it
   * after `if (!x.isRight())`, where `x` is a failure. On a success it throws: that is a bug.
   */
  propagate<U>(): Either<U, E> {
    if (this.isRightSide) {
      throw new Error("propagate is for a failure: call it only after !isRight()");
    }
    return Either.left(this.payload as E);
  }

  /**
   * Whether both are on the same side with equal payloads. `equal` compares the payloads; the
   * default is `===`.
   */
  isEqual(
    other: Either<T, E>,
    equal: (a: E | T, b: E | T) => boolean = (a, b) => a === b,
  ): boolean {
    return this.isRightSide === other.isRightSide && equal(this.payload, other.payload);
  }

  /** Transform the success, if it is one. */
  private map<U>(f: (value: T) => U): Either<U, E> {
    return this.isRightSide
      ? Either.right(f(this.payload as T))
      : (this as unknown as Either<U, E>);
  }

  /** Transform the failure, if it is one. */
  mapLeft<F>(f: (error: E) => F): Either<T, F> {
    return this.isRightSide ? (this as unknown as Either<T, F>) : Either.left(f(this.payload as E));
  }

  /** Chain a step that may itself fail (the monad's bind). The error types add up. */
  private flatMap<F, U>(f: (value: T) => Either<U, F>): Either<U, E | F> {
    return this.isRightSide ? f(this.payload as T) : (this as unknown as Either<U, E>);
  }

  /** Get out of the Either, handling both cases. */
  match<R>(cases: { readonly left: (error: E) => R; readonly right: (value: T) => R }): R {
    return this.isRightSide ? cases.right(this.payload as T) : cases.left(this.payload as E);
  }

  /** The success, or `fallback` if it is a failure. */
  getOrElse<U>(fallback: U): T | U {
    return this.isRightSide ? (this.payload as T) : fallback;
  }

  /** `Some(value)` for a success, `None` for a failure (the error is dropped). */
  toMaybe(): Maybe<T> {
    return this.isRightSide ? Maybe.some(this.payload as T) : Maybe.none();
  }
}

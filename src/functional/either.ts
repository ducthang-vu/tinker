// Either<E, T>: a success (Right, holding a T) or a failure (Left, holding
// an E). By convention "right" is the correct result.
//
// Like Maybe and Task, it is a monad with the same vocabulary:
//   Either.of(a)      unit: wrap a value (a Right)
//   either.map(f)     transform the success, if it is one
//   either.flatMap(f) chain a step that may itself fail
//   either.match({ left, right })  get out, handling both cases
//
//   Either.tryCatch(() => JSON.parse(text))
//     .flatMap(validate)
//     .match({ left: showError, right: render });

import { Maybe } from "./maybe.ts";

/**
 * An Either whose failure is an Error: the common case, e.g. the result of
 * code that can throw. `Either.tryCatchError` and `Either.lift` create them,
 * and `getOrThrow()` turns one back into a value or a thrown error.
 */
export type EitherError<T> = Either<Error, T>;

/** `value` as an Error: an Error as is, anything else wrapped (kept as its `cause`). */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

export class Either<E, T> {
  private constructor(
    private readonly isRightSide: boolean,
    private readonly payload: E | T,
  ) {}

  /** A success. */
  static right<T, E = never>(value: T): Either<E, T> {
    return new Either<E, T>(true, value);
  }

  /** A failure. */
  static left<E, T = never>(error: E): Either<E, T> {
    return new Either<E, T>(false, error);
  }

  /** Unit (the monad's `return`): the same as `right`. */
  static of<T, E = never>(value: T): Either<E, T> {
    return Either.right(value);
  }

  /** Run `fn`: its result as a Right, or what it throws as a Left. */
  static tryCatch<T>(fn: () => T): Either<unknown, T> {
    try {
      return Either.right(fn());
    } catch (error) {
      return Either.left(error);
    }
  }

  /**
   * Like `tryCatch`, but what `fn` throws always becomes an Error: an Error
   * as is, anything else (e.g. `throw "oops"`) wrapped, keeping the original
   * value as the Error's `cause`.
   */
  static tryCatchError<T>(fn: () => T): EitherError<T> {
    return Either.tryCatch(fn).mapLeft(toError);
  }

  /**
   * Turn a function that may throw into one that returns an EitherError,
   * e.g. `.flatMap(Either.lift(validate))`.
   */
  static lift<A extends unknown[], T>(fn: (...args: A) => T): (...args: A) => EitherError<T> {
    return (...args) => Either.tryCatchError(() => fn(...args));
  }

  isRight(): boolean {
    return this.isRightSide;
  }

  isLeft(): boolean {
    return !this.isRightSide;
  }

  /** Transform the success, if it is one. */
  map<U>(f: (value: T) => U): Either<E, U> {
    return this.isRightSide ? Either.right(f(this.payload as T)) : (this as unknown as Either<E, U>);
  }

  /** Transform the failure, if it is one. */
  mapLeft<F>(f: (error: E) => F): Either<F, T> {
    return this.isRightSide ? (this as unknown as Either<F, T>) : Either.left(f(this.payload as E));
  }

  /** Chain a step that may itself fail (the monad's bind). The error types add up. */
  flatMap<F, U>(f: (value: T) => Either<F, U>): Either<E | F, U> {
    return this.isRightSide ? f(this.payload as T) : (this as unknown as Either<E, U>);
  }

  /** Get out of the Either, handling both cases. */
  match<R>(cases: { readonly left: (error: E) => R; readonly right: (value: T) => R }): R {
    return this.isRightSide ? cases.right(this.payload as T) : cases.left(this.payload as E);
  }

  /** The success, or `fallback` if it is a failure. */
  getOrElse<U>(fallback: U): T | U {
    return this.isRightSide ? (this.payload as T) : fallback;
  }

  /**
   * The success, or throw the failure: the way back to code using
   * exceptions. Only available when the failure is an Error.
   */
  getOrThrow(this: EitherError<T>): T {
    return this.match({
      left: (error) => {
        throw error;
      },
      right: (value) => value,
    });
  }

  /** `Some(value)` for a success, `None` for a failure (the error is dropped). */
  toMaybe(): Maybe<T> {
    return this.isRightSide ? Maybe.some(this.payload as T) : Maybe.none();
  }
}

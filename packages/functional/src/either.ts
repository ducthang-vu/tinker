// Either<T, E>: a Right (holding a T) or a Left (holding an E). Whatever the client puts
// in the Left is the client's choice. By convention "right" is the correct result.
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

/** An Either that is a Left: where `isLeft()` said yes, its content is `get()`. */
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

  /** A Left, holding `error`: whatever the caller chose to put there. */
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
   * for the rest of the function, so `x.get()` is the value.
   */
  isRight(): this is Right<T> {
    return this.isRightSide;
  }

  /** Whether this is a Left. */
  isLeft(): this is Left<E> {
    return !this.isRightSide;
  }

  /** What the box holds: the value of a Right, or the Left's content. Typed by the narrowing. */
  get(this: Right<T>): T;
  get(this: Left<E>): E;
  get(): T | E {
    return this.payload;
  }

  /**
   * The Left, as the early return of a function whose Right type is `U`. Call it after
   * `if (!x.isRight())`. On a Right it throws: that is a bug.
   */
  propagate<U>(): Either<U, E> {
    if (this.isRightSide) {
      throw new Error("propagate is for a Left: call it only after !isRight()");
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

  /** Transform the Left's content, if it is a Left. */
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

  /** `Some(value)` for a Right, `None` for a Left (its content is dropped). */
  toMaybe(): Maybe<T> {
    return this.isRightSide ? Maybe.some(this.payload as T) : Maybe.none();
  }
}

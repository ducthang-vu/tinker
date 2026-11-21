// Either<T, E>: a Right (holding a T) or a Left (holding an E). Whatever the client puts
// in the Left is the client's choice. By convention "right" is the correct result.
//
// Either is a union of two boxes, Right and Left. After `if (!x.isRight()) return x;`, x is
// a Right for the rest of the function, and `x.get()` is its value.
//
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

/**
 * `value` as an Error: an Error as is, anything else wrapped (kept as its
 * `cause`). Used wherever something that was thrown becomes a failure value.
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

/** A Right: a success, holding a T. */
export class Right<T, E> {
  readonly side = "right" as const;

  constructor(private readonly payload: T) {}

  /** Whether this is a Right. After `if (!x.isRight()) return x;`, `x` is a Right. */
  isRight(): this is Right<T, E> {
    return true;
  }

  /** Whether this is a Left. */
  isLeft(): this is Left<T, E> {
    return false;
  }

  /** The value. */
  get(): T {
    return this.payload;
  }

  /** Get out of the Either, handling both cases. */
  match<R>(cases: { readonly left: (error: E) => R; readonly right: (value: T) => R }): R {
    return cases.right(this.payload);
  }

  /** Transform the value. */
  map<U>(f: (value: T) => U): Either<U, E> {
    return new Right<U, E>(f(this.payload));
  }

  /** A Right is unchanged: there is no Left content to transform. */
  mapLeft<F>(f: (error: E) => F): Either<T, F> {
    return new Right<T, F>(this.payload);
  }

  /** Chain a step that may itself fail (the monad's bind). The error types add up. */
  flatMap<F, U>(f: (value: T) => Either<U, F>): Either<U, E | F> {
    return f(this.payload);
  }

  /** `Some(value)`: a Right's value is present. */
  toMaybe(): Maybe<T> {
    return Maybe.some(this.payload);
  }

  /** Whether `other` is a Right with an equal value (`equal` compares, default `===`). */
  isEqual(
    other: Either<T, E>,
    equal: (a: T | E, b: T | E) => boolean = (a, b) => a === b,
  ): boolean {
    return other.side === "right" && equal(this.payload, other.get());
  }
}

/** A Left: a failure, holding whatever the caller chose to put there. */
export class Left<T, E> {
  readonly side = "left" as const;

  constructor(private readonly payload: E) {}

  /** Whether this is a Right. */
  isRight(): this is Right<T, E> {
    return false;
  }

  /** Whether this is a Left. After `if (!x.isLeft())`, `x` is a Left from there on. */
  isLeft(): this is Left<T, E> {
    return true;
  }

  /** The content of the Left. */
  get(): E {
    return this.payload;
  }

  /** Get out of the Either, handling both cases. */
  match<R>(cases: { readonly left: (error: E) => R; readonly right: (value: T) => R }): R {
    return cases.left(this.payload);
  }

  /** A Left is unchanged: there is no value to transform. */
  map<U>(f: (value: T) => U): Either<U, E> {
    return new Left<U, E>(this.payload);
  }

  /** Transform the Left's content. */
  mapLeft<F>(f: (error: E) => F): Either<T, F> {
    return new Left<T, F>(f(this.payload));
  }

  /** A Left stays a Left: the step does not run. */
  flatMap<F, U>(f: (value: T) => Either<U, F>): Either<U, E | F> {
    return new Left<U, E | F>(this.payload);
  }

  /** `None`: a Left has no value (its content is dropped). */
  toMaybe(): Maybe<T> {
    return Maybe.none();
  }

  /** Whether `other` is a Left with equal content. `equal` compares them (default `===`). */
  isEqual(
    other: Either<T, E>,
    equal: (a: T | E, b: T | E) => boolean = (a, b) => a === b,
  ): boolean {
    return other.side === "left" && equal(this.payload, other.get());
  }
}

/** Either: a Right or a Left. */
export type Either<T, E> = Right<T, E> | Left<T, E>;

/** The constructors, and the monad operations that work on the pipe. */
export const Either = {
  /** A success. */
  right<T, E = never>(value: T): Either<T, E> {
    return new Right<T, E>(value);
  },

  /** A Left, holding `error`: whatever the caller chose to put there. */
  left<T = never, E = never>(error: E): Either<T, E> {
    return new Left<T, E>(error);
  },

  /** Run `fn`: its result as a Right, or what it throws as a Left. */
  try<T>(fn: () => T): Either<T, unknown> {
    try {
      return Either.right(fn());
    } catch (error) {
      return Either.left(error);
    }
  },

  map: dual<EitherMap>(
    2,
    (self: Either<unknown, unknown>, f: (value: unknown) => unknown) => self.map(f),
  ),

  flatMap: dual<EitherFlatMap>(
    2,
    (self: Either<unknown, unknown>, f: (value: unknown) => Either<unknown, unknown>) =>
      self.flatMap(f),
  ),
};

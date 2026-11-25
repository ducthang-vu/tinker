// Either<T, E>: a Right holding a T, or a Left holding an E. A Right is the success, and a Left
// is the other case, holding what the caller chose to put there: an error, a reason, or anything
// else. The names follow Haskell's convention. Each case is a class with a private constructor:
// build a case with `Right.of(value)` or `Left.of(error)`, and read a value only with `match`.
//
// A pipeline of steps keeps a success going and sets the Left aside. `map` and `flatMap` run
// their step only on a Right, so the next step gets the value of a success and nothing else:
//
//   const id = parseId("7");                          // Right(7): success
//   const label = map(id, (n) => `user ${n}`);        // Right("user 7"): the step ran
//   const profile = flatMap(id, (n) => loadUser(n));  // loadUser returns an Either, so it joins
//
//   const bad = parseId("x");                         // Left("not a number"): the other case
//   const same = map(bad, (n) => `user ${n}`);        // Left("not a number"): the step was skipped
//
// A Left skips every step after it and reaches the end unchanged. `mapLeft` changes what a Left
// holds, and `match` is where the pipeline ends: it reads the value of a Right and what a Left
// holds.

import {
  EQUALS,
  equalCases,
  MATCHABLE,
  match,
  type Case,
  type Equatable,
  type Matchable,
} from "./monad.ts";
import { Continue, Halt, OUTCOME, type Outcome } from "./outcome.ts";

/**
 * A Right: a success, holding a T. The steps after it (`map`, `flatMap`) run on this value.
 */
export class Right<T> implements Matchable<"Right", readonly [T]>, Equatable, Outcome<T, never> {
  /** The case this Right is, for `match`: its name and its value. */
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

  /**
   * The protocol form: a Right continues with the value it holds.
   *
   * @returns A Continue holding this Right's value.
   */
  [OUTCOME](): Continue<T> {
    return Continue.of(this[MATCHABLE].args[0]);
  }
}

/**
 * A Left: the other case, holding what the caller chose to put there. The steps after it are
 * skipped, and it reaches the end of the pipeline unchanged.
 */
export class Left<E> implements Matchable<"Left", readonly [E]>, Equatable, Outcome<never, E> {
  /** The case this Left is, for `match`: its name and its error. */
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
   * A Left: the other case, holding what the caller chose.
   *
   * @param error The error the Left holds.
   * @returns A Left holding `error`.
   */
  static of<E, T = never>(error: E): Either<T, E> {
    return new Left<E>(error);
  }

  /**
   * The protocol form: a Left halts with the error it holds.
   *
   * @returns A Halt holding this Left's error.
   */
  [OUTCOME](): Halt<E> {
    return Halt.of(this[MATCHABLE].args[0]);
  }
}

/**
 * Either: a Right holding a T (a success), or a Left holding an E (the other case). A pipeline of
 * `map` and `flatMap` steps runs on the Right, and passes a Left on unchanged.
 *
 * @example
 * ```ts
 * import { Left, map, match, Right, type Either } from "@tinker/functional";
 *
 * const parse = (text: string): Either<number, string> =>
 *   /^\d+$/.test(text) ? Right.of(Number(text)) : Left.of("not a number");
 *
 * const label = map(parse("7"), (n) => `user ${n}`); // Right("user 7"): the step ran
 * const same = map(parse("x"), (n) => `user ${n}`); // Left("not a number"): skipped
 * match(label, { Right: (text) => text, Left: (error) => error }); // "user 7"
 * ```
 */
export type Either<T, E> = Right<T> | Left<E>;

/** The two handlers of a match, named after the cases. */
export type EitherCases<T, E, R> = {
  /** The handler `match` calls for a Right. */
  readonly Right: (value: T) => R;
  /** The handler `match` calls for a Left. */
  readonly Left: (error: E) => R;
};

/**
 * `mapLeft`: data-first `mapLeft(e, f)`, or data-last `mapLeft(f)` for `pipe`.
 *
 * @param self The Either to map.
 * @param f The function applied to what a Left holds.
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
 * @deprecated Internal functions return an Either themselves, so nothing needs to wrap a throw.
 *   Use the function's own Either instead of catching what it throws.
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

/**
 * An Either from any outcome: a Continue becomes a Right holding its value, and a Halt becomes a
 * Left holding its reason.
 *
 * @param outcome Any value that implements the outcome protocol.
 * @returns A Right holding the value, or a Left holding the reason.
 */
export function createEither<T, E>(outcome: Outcome<T, E>): Either<T, E> {
  const form = outcome[OUTCOME]();
  return form instanceof Continue ? Right.of<T, E>(form.value) : Left.of<E, T>(form.reason);
}

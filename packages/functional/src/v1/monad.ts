// The shape every monad box has: a case name and its arguments, under a symbol the package does
// not export. `match` and `isEqual` work on that shape, so they are the same for every monad.

import type { Either, EitherCases } from "./either.ts";
import type { Maybe, MaybeCases } from "./maybe.ts";

/** The identity of a box: its case name, and its arguments in order. */
export const MONAD: unique symbol = Symbol("monad");

/** The identity of one case. */
export interface Identity<Name extends string, Args extends readonly unknown[]> {
  readonly name: Name;
  readonly args: Args;
}

/** A monad box: it carries its identity under the symbol. Each case class implements it. */
export interface Monad<
  Name extends string = string,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly [MONAD]: Identity<Name, Args>;
}

/** Get out of an Either, handling each case by its constructor name. */
export function match<T, E, R>(self: Either<T, E>, cases: EitherCases<T, E, R>): R;
/** Get out of a Maybe, handling each case by its constructor name. */
export function match<T, R>(self: Maybe<T>, cases: MaybeCases<T, R>): R;
export function match(self: Monad, cases: Record<string, (...args: never[]) => unknown>): unknown {
  const identity = self[MONAD];
  return cases[identity.name]!(...(identity.args as never[]));
}

/**
 * Equal only to a box of the same case with equal arguments. `equal` compares the arguments
 * (default `===`).
 */
export function isEqual(
  self: Monad,
  other: Monad,
  equal: (a: unknown, b: unknown) => boolean = (a, b) => a === b,
): boolean {
  const mine = self[MONAD];
  const theirs = other[MONAD];
  return mine.name === theirs.name
    && mine.args.every((arg, index) => equal(arg, theirs.args[index]));
}

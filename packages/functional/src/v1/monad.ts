// The shape every matchable box has: a case name and its arguments, under a symbol the package
// does not export. `match` and `isEqual` work on that shape, so they are the same for every box.

import type { Either, EitherCases } from "./either.ts";
import type { Maybe, MaybeCases } from "./maybe.ts";

/** The case of a box: its case name, and its arguments in order. */
export const MATCHABLE: unique symbol = Symbol("matchable");

/** The shape of one case. */
export interface Case<Name extends string, Args extends readonly unknown[]> {
  readonly name: Name;
  readonly args: Args;
}

/** A matchable box: it carries its case under the symbol. Each case class implements it. */
export interface Matchable<
  Name extends string = string,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly [MATCHABLE]: Case<Name, Args>;
}

/** Get out of an Either, handling each case by its constructor name. */
export function match<T, E, R>(self: Either<T, E>, cases: EitherCases<T, E, R>): R;
/** Get out of a Maybe, handling each case by its constructor name. */
export function match<T, R>(self: Maybe<T>, cases: MaybeCases<T, R>): R;
export function match(
  self: Matchable,
  cases: Record<string, (...args: never[]) => unknown>,
): unknown {
  const kase = self[MATCHABLE];
  return cases[kase.name]!(...(kase.args as never[]));
}

/**
 * Equal only to a box of the same case with equal arguments. `equal` compares the arguments
 * (default `===`).
 */
export function isEqual(
  self: Matchable,
  other: Matchable,
  equal: (a: unknown, b: unknown) => boolean = (a, b) => a === b,
): boolean {
  const mine = self[MATCHABLE];
  const theirs = other[MATCHABLE];
  return mine.name === theirs.name
    && mine.args.every((arg, index) => equal(arg, theirs.args[index]));
}

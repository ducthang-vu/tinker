// Two protocols, kept apart. A matchable box has a case name and its arguments under MATCHABLE,
// and `match` reads that shape. An equatable value knows how to compare itself under EQUALS, and
// `isEqual` reads that protocol. A matchable box may implement EQUALS by reusing the case shape,
// but the two protocols are separate: `isEqual` does not require MATCHABLE.

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

/** The equality protocol: a value that can say whether it equals another value. */
export const EQUALS: unique symbol = Symbol("equals");

/** A value with its own equality. Matchable boxes implement it through `equalCases`. */
export interface Equatable {
  [EQUALS](other: unknown): boolean;
}

/**
 * Whether `a` and `b` are equal. A value with the EQUALS protocol decides for itself. Any other
 * value is equal to another when they are the same value, with NaN equal to NaN and 0 to -0
 * (SameValueZero, the rule `Set` and `Map` use). Objects are equal only to themselves.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (hasEquals(a)) {
    return a[EQUALS](b);
  }
  return a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));
}

/**
 * Equal to a box of the same case whose arguments are equal (by `isEqual`). The matchable
 * boxes use it for their EQUALS method, so nested boxes compare by value.
 */
export function equalCases(self: Matchable, other: unknown): boolean {
  if (typeof other !== "object" || other === null || !(MATCHABLE in other)) {
    return false;
  }
  const mine = self[MATCHABLE];
  const theirs = (other as Matchable)[MATCHABLE];
  return mine.name === theirs.name
    && mine.args.length === theirs.args.length
    && mine.args.every((arg, index) => isEqual(arg, theirs.args[index]));
}

function hasEquals(value: unknown): value is Equatable {
  return typeof value === "object" && value !== null && EQUALS in value;
}

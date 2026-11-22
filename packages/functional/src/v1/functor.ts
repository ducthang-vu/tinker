// The functor protocol, and the universal `map` and `flatMap`. A value that implements the MAP
// protocol maps itself. A matchable box with no MAP method is mapped by its case's registered
// implementation (see registry.ts). The built-in cases are registered at the bottom of this file:
// Right and Left for Either, Some and None for Maybe.

import { Right, type Either } from "./either.ts";
import { Some, type Maybe } from "./maybe.ts";
import { MATCHABLE, match, type Matchable } from "./monad.ts";
import {
  flatMapFor,
  implementFlatMap,
  implementMap,
  mapFor,
  type FlatMapImpl,
  type MapImpl,
} from "./registry.ts";

/** The functor protocol: a value that maps itself. Any value may implement it, matchable or not. */
export const MAP: unique symbol = Symbol("map");

/** A functor: a value with a `map` of its own, under the MAP symbol. */
export interface Functor<T> {
  [MAP]<U>(f: (value: T) => U): Functor<U>;
}

/** A data-last `map`: applied to a box, it maps the box. */
export interface MapFn<T, U> {
  <E>(self: Either<T, E>): Either<U, E>;
  (self: Maybe<T>): Maybe<U>;
  (self: Functor<T>): Functor<U>;
  (self: Matchable): Matchable;
}

/** A data-last `flatMap` returning an Either. */
export type EitherFlatMapFn<T, U, F> = <E>(self: Either<T, E>) => Either<U, E | F>;

/** A data-last `flatMap` returning a Maybe. */
export type MaybeFlatMapFn<T, U> = (self: Maybe<T>) => Maybe<U>;

/**
 * Map the value of a box: `f` is applied to a value inside the box, and a box of the same case
 * holds the result. A case with no value is returned unchanged. A value that implements the MAP
 * protocol maps itself; a matchable box without it uses its case's registered `map`. Data-first
 * `map(box, f)`, or data-last `map(f)`, which returns a function of the box.
 *
 * @example
 * ```ts
 * import { map, Some } from "@tinker/functional/v1";
 *
 * map(Some.of(2), (n: number) => n * 10); // Some(20)
 * ```
 *
 * @example
 * ```ts
 * import { map, Right } from "@tinker/functional/v1";
 *
 * const addOne = map((n: number) => n + 1);
 * addOne(Right.of<number, string>(2)); // Right(3)
 * ```
 */
export function map<T, E, U>(self: Either<T, E>, f: (value: T) => U): Either<U, E>;
export function map<T, U>(self: Maybe<T>, f: (value: T) => U): Maybe<U>;
export function map<T, U>(f: (value: T) => U): MapFn<T, U>;
export function map<T, U>(self: Functor<T>, f: (value: T) => U): Functor<U>;
export function map<T, U>(self: Matchable, f: (value: T) => U): Matchable;
export function map(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => unknown];
    return (self: Matchable) => map(self, f);
  }
  const [self, f] = args as [unknown, (value: unknown) => unknown];
  if (isFunctor(self)) {
    return self[MAP](f);
  }
  return mapFor(caseNameOf(self))(self as Matchable, f);
}

/** Whether the value has a `map` of its own under the MAP symbol. */
function isFunctor(value: unknown): value is Functor<unknown> {
  return typeof value === "object" && value !== null && MAP in value
    && typeof (value as Functor<unknown>)[MAP] === "function";
}

/** The case name of a matchable box. Throws for a value that is neither a functor nor matchable. */
function caseNameOf(value: unknown): string {
  if (typeof value === "object" && value !== null && MATCHABLE in value) {
    return (value as Matchable)[MATCHABLE].name;
  }
  throw new Error("map needs a functor (a value with the MAP method) or a matchable box");
}

/**
 * Chain a box through `f`: `f` takes the value inside the box and returns a box, and that box is
 * the result. A case with no value is returned unchanged. Data-first `flatMap(box, f)`, or
 * data-last `flatMap(f)`, which returns a function of the box.
 *
 * @example
 * ```ts
 * import { flatMap, None, Some } from "@tinker/functional/v1";
 *
 * const positive = (n: number) => (n > 0 ? Some.of(n) : None.of<number>());
 * flatMap(Some.of(-1), positive); // None
 * ```
 */
export function flatMap<T, E, U, F>(
  self: Either<T, E>,
  f: (value: T) => Either<U, F>,
): Either<U, E | F>;
export function flatMap<T, U>(self: Maybe<T>, f: (value: T) => Maybe<U>): Maybe<U>;
export function flatMap<T, U, F>(
  f: (value: T) => Either<U, F>,
): <E>(self: Either<T, E>) => Either<U, E | F>;
export function flatMap<T, U>(f: (value: T) => Maybe<U>): MaybeFlatMapFn<T, U>;
export function flatMap<T, U>(
  self: Matchable,
  f: (value: T) => Matchable,
): Matchable;
export function flatMap(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(value: unknown) => Matchable];
    return (self: Matchable) => flatMap(self, f);
  }
  const [self, f] = args as [Matchable, (value: unknown) => Matchable];
  return flatMapFor(self[MATCHABLE].name)(self, f);
}

/** Maps an Either: `f` is applied to a Right's value; a Left is returned unchanged. */
const eitherMap: MapImpl = (box, f) =>
  match<unknown, unknown, Either<unknown, unknown>>(box as Either<unknown, unknown>, {
    Right: (value) => Right.of(f(value)),
    Left: () => box as Either<unknown, unknown>,
  });

/** Chains an Either: `f` is applied to a Right's value; a Left is returned unchanged. */
const eitherFlatMap: FlatMapImpl = (box, f) =>
  match<unknown, unknown, Either<unknown, unknown>>(box as Either<unknown, unknown>, {
    Right: (value) => f(value) as Either<unknown, unknown>,
    Left: () => box as Either<unknown, unknown>,
  });

/** Maps a Maybe: `f` is applied to a Some's value; a None is returned unchanged. */
const maybeMap: MapImpl = (box, f) =>
  match<unknown, Maybe<unknown>>(box as Maybe<unknown>, {
    Some: (value) => Some.of(f(value)),
    None: () => box as Maybe<unknown>,
  });

/** Chains a Maybe: `f` is applied to a Some's value; a None is returned unchanged. */
const maybeFlatMap: FlatMapImpl = (box, f) =>
  match<unknown, Maybe<unknown>>(box as Maybe<unknown>, {
    Some: (value) => f(value) as Maybe<unknown>,
    None: () => box as Maybe<unknown>,
  });

// The built-in cases. A case name can be registered once, so these must stay the only ones.
implementMap("Right", eitherMap);
implementMap("Left", eitherMap);
implementFlatMap("Right", eitherFlatMap);
implementFlatMap("Left", eitherFlatMap);
implementMap("Some", maybeMap);
implementMap("None", maybeMap);
implementFlatMap("Some", maybeFlatMap);
implementFlatMap("None", maybeFlatMap);

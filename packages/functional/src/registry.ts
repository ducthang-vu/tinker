// The registry of how each case maps and chains. `map` and `flatMap` look up the implementation
// for a box's case name here, so a new monad only has to register its cases. A case name can be
// registered once: a second registration throws, so one case never has two behaviours.

import type { Matchable } from "./monad.ts";

/** Maps a box of one case: applies `f` to its value and returns a box. */
export type MapImpl = (box: Matchable, f: (value: unknown) => unknown) => Matchable;

/** Chains a box of one case: applies `f`, which returns a box, and returns its result. */
export type FlatMapImpl = (box: Matchable, f: (value: unknown) => Matchable) => Matchable;

const maps = new Map<string, MapImpl>();
const flatMaps = new Map<string, FlatMapImpl>();

/**
 * Register how `map` treats boxes of the case named `caseName`. Each case can be registered once.
 *
 * @example
 * ```ts
 * import { implementMap, type Matchable, MATCHABLE } from "@tinker/functional";
 *
 * // A Pending case: it holds no value, so mapping it returns it unchanged.
 * class Pending implements Matchable<"Pending", readonly []> {
 *   readonly [MATCHABLE] = { name: "Pending", args: [] } as const;
 * }
 *
 * implementMap("Pending", (box) => box);
 * ```
 *
 * @throws If `caseName` already has a `map` implementation.
 */
export function implementMap(caseName: string, impl: MapImpl): void {
  register(maps, "map", caseName, impl);
}

/**
 * Register how `flatMap` treats boxes of the case named `caseName`. Each case can be registered
 * once.
 *
 * @example
 * ```ts
 * import { implementFlatMap, type Matchable } from "@tinker/functional";
 *
 * // A Pending case: it holds no value, so chaining it returns it unchanged.
 * implementFlatMap("Pending", (box) => box);
 * ```
 *
 * @throws If `caseName` already has a `flatMap` implementation.
 */
export function implementFlatMap(caseName: string, impl: FlatMapImpl): void {
  register(flatMaps, "flatMap", caseName, impl);
}

/** The `map` implementation for a case. Throws if the case was never registered. */
export function mapFor(caseName: string): MapImpl {
  return lookup(maps, "map", caseName, "implementMap");
}

/** The `flatMap` implementation for a case. Throws if the case was never registered. */
export function flatMapFor(caseName: string): FlatMapImpl {
  return lookup(flatMaps, "flatMap", caseName, "implementFlatMap");
}

function register<I>(table: Map<string, I>, operation: string, caseName: string, impl: I): void {
  if (table.has(caseName)) {
    throw new Error(`${operation} is already implemented for the case ${caseName}`);
  }
  table.set(caseName, impl);
}

function lookup<I>(
  table: Map<string, I>,
  operation: string,
  caseName: string,
  register: string,
): I {
  const impl = table.get(caseName);
  if (impl === undefined) {
    throw new Error(`${operation} is not implemented for the case ${caseName}: call ${register}`);
  }
  return impl;
}

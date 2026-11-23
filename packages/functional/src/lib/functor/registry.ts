// The registry of how each case maps and chains. `map` and `flatMap` look up the implementation
// for a box's case name here, so a new monad only has to register its cases. A case name can be
// registered once: a second registration throws, so one case never has two behaviours.

import type { Matchable } from "../monad/monad.ts";

/** Maps a box of one case: applies `f` to its value and returns a box. */
export type MapImpl = (box: Matchable, f: (value: unknown) => unknown) => Matchable;

/** Chains a box of one case: applies `f`, which returns a box, and returns its result. */
export type FlatMapImpl = (box: Matchable, f: (value: unknown) => Matchable) => Matchable;

const maps = new Map<string, MapImpl>();
const flatMaps = new Map<string, FlatMapImpl>();

/**
 * Register how `map` treats boxes of the case named `caseName`. Each case can be registered once.
 *
 * @param caseName The case name the boxes have, as the `MATCHABLE` protocol reports it.
 * @param impl The implementation: it maps a box of this case and returns a box.
 * @throws If `caseName` already has a `map` implementation.
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
 */
export function implementMap(caseName: string, impl: MapImpl): void {
  register(maps, "map", caseName, impl);
}

/**
 * Register how `flatMap` treats boxes of the case named `caseName`. Each case can be registered
 * once.
 *
 * @param caseName The case name the boxes have, as the `MATCHABLE` protocol reports it.
 * @param impl The implementation: it chains a box of this case and returns the box `f` gives back.
 * @throws If `caseName` already has a `flatMap` implementation.
 * @example
 * ```ts
 * import { implementFlatMap, type Matchable } from "@tinker/functional";
 *
 * // A Pending case: it holds no value, so chaining it returns it unchanged.
 * implementFlatMap("Pending", (box) => box);
 * ```
 */
export function implementFlatMap(caseName: string, impl: FlatMapImpl): void {
  register(flatMaps, "flatMap", caseName, impl);
}

/**
 * The `map` implementation for a case. Throws if the case was never registered.
 *
 * @param caseName The case name the implementation was registered under.
 * @returns The implementation registered for the case.
 */
export function mapFor(caseName: string): MapImpl {
  return lookup(maps, "map", caseName, "implementMap");
}

/**
 * The `flatMap` implementation for a case. Throws if the case was never registered.
 *
 * @param caseName The case name the implementation was registered under.
 * @returns The implementation registered for the case.
 */
export function flatMapFor(caseName: string): FlatMapImpl {
  return lookup(flatMaps, "flatMap", caseName, "implementFlatMap");
}

/**
 * Stores `impl` under `caseName` in `table`. Throws if the case is already registered.
 *
 * @param table The registry to add to: the `map` or the `flatMap` table.
 * @param operation The operation's name, for the error message.
 * @param caseName The case name to register.
 * @param impl The implementation for the case.
 * @throws {Error} When the case is already registered in `table`.
 */
function register<I>(table: Map<string, I>, operation: string, caseName: string, impl: I): void {
  if (table.has(caseName)) {
    throw new Error(`${operation} is already implemented for the case ${caseName}`);
  }
  table.set(caseName, impl);
}

/**
 * Reads the implementation for `caseName` from `table`. Throws, naming the function to call, if the
 * case was never registered.
 *
 * @param table The registry to read: the `map` or the `flatMap` table.
 * @param operation The operation's name, for the error message.
 * @param caseName The case name to look up.
 * @param register The name of the function that registers the case, for the error message.
 * @returns The implementation registered for the case.
 * @throws {Error} When the case was never registered in `table`.
 */
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

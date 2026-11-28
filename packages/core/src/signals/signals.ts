// The public signals API: interfaces and factories. Exported through ./index.ts.
//
// Everything users need, and nothing more: the interfaces below expose only
// reading, writing and lifecycle methods. The reactive graph's internals
// (dirty flags, versions, dependency bookkeeping) stay in ./internal.
//
// Signals are callable: `count()` reads the value. Each factory wraps an
// internal node in a function and keeps the node in a closure, so users
// cannot reach the internals, not even with a cast.
//
// Every signal carries a tag under the private symbol SIGNAL: `{ id }`, the id of the
// node it reads, so a signal and its read-only view share one. The tag tells a signal
// from any other function; a signal is writable when it also has a `set` method.

import { Computed as ComputedNode } from "./internal/computed.ts";
import { Signal as SignalNode } from "./internal/signal.ts";
import type { EqualityFn, Readable } from "./internal/types.ts";
import { Watch as WatchNode, type WatchFn, type WatchScheduler } from "./internal/watch.ts";

/** A value you can read by calling it. Reading it inside a computed or watch tracks it. */
export interface ReadonlySignal<T> {
  /**
   * Read the value. Inside a computed or watch, this makes it a dependency.
   * To read without tracking, use `untracked(() => signal())`.
   */
  (): T;
}

/** A value you can read and write. */
export interface Signal<T> extends ReadonlySignal<T> {
  /** Set a new value. Nothing happens if it is equal to the current one. */
  set(value: T): void;
  /** Set a new value computed from the current one. */
  update(fn: (current: T) => T): void;
  /** A read-only view of this signal, safe to hand out. */
  asReadonly(): ReadonlySignal<T>;
}

/** A running side effect. Re-runs, via its scheduler, when what it read changes. */
export interface Watch {
  /** Stop watching and run the last cleanup. */
  destroy(): void;
}

/**
 * Create a writable signal.
 * @param equal Decides whether a new value counts as a change (default `Object.is`).
 */
export function signal<T>(value: T, equal?: EqualityFn<T>): Signal<T> {
  const node = new SignalNode(value, equal);
  let readonlyView: ReadonlySignal<T> | undefined;
  return Object.assign(readable(node), {
    set: (next: T) => node.set(next),
    update: (fn: (current: T) => T) => node.update(fn),
    asReadonly: () => (readonlyView ??= readable(node)),
  });
}

/**
 * Create a read-only value derived from other signals. It is computed
 * lazily, cached, and recomputed only when something it read changes.
 * @param equal Decides whether a recomputed value counts as a change (default `Object.is`).
 */
export function computed<T>(computation: () => T, equal?: EqualityFn<T>): ReadonlySignal<T> {
  return readable(new ComputedNode(computation, equal));
}

/**
 * Create a watch: `fn` runs (through `scheduler`) now, and again whenever
 * a signal it read changes.
 */
export function watch(fn: WatchFn, scheduler: WatchScheduler): Watch {
  const node = new WatchNode(fn, scheduler);
  return { destroy: () => node.destroy() };
}

/**
 * The key of a signal's tag.
 *
 * @privateAPI For the framework: `isSignal` tells a signal from another function, and
 *   `signal[SIGNAL].id` is its id, for debugging.
 */
export const SIGNAL: unique symbol = Symbol("signal");

/** What a signal's tag holds: the id of the signal it reads, for debugging. */
export interface SignalTag {
  readonly id: number;
}

/** The id the next signal node gets. */
let nextId = 0;

/** The ids of the nodes, given the first time one is wrapped. */
const ids = new WeakMap<object, number>();

/**
 * Tag `fn` as a signal reading the same node as `source`, with its id: for a signal made outside
 * this module that wraps another one.
 *
 * @privateAPI For the framework's own signals made outside this module (`model()`).
 * @param fn The function to tag.
 * @param source The signal it reads.
 * @returns `fn`, tagged.
 */
export function tagSignal<F extends object>(fn: F, source: ReadonlySignal<unknown>): F {
  return tagged(fn, (source as unknown as { readonly [SIGNAL]: SignalTag })[SIGNAL].id);
}

/** `fn` with the tag of the signal `id`: read-only, and not enumerable. */
function tagged<F extends object>(fn: F, id: number): F {
  const tag: SignalTag = Object.freeze({ id });
  return Object.defineProperty(fn, SIGNAL, { value: tag });
}

/**
 * Whether `value` is a signal: a function made by `signal`, `computed`, `asReadonly`, or one of
 * the framework's (`input()`, `model()`). It is writable when it also has a `set` method.
 *
 * @privateAPI For the framework, e.g. a two-way binding, which needs a writable signal.
 * @param value Any value.
 * @returns Whether it carries a signal's tag.
 */
export function isSignal(value: unknown): value is ReadonlySignal<unknown> {
  return typeof value === "function" && SIGNAL in value;
}

/** Wrap an internal node in a callable read-only signal, tagged with the node's id. */
function readable<T>(node: Readable<T>): ReadonlySignal<T> {
  let id = ids.get(node);
  if (id === undefined) {
    id = nextId++;
    ids.set(node, id);
  }
  return tagged(() => node.get(), id);
}

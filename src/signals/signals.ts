// The public signals API: interfaces and factories. Exported through ./index.ts.
//
// Everything users need, and nothing more: the interfaces below expose only
// reading, writing and lifecycle methods. The reactive graph's internals
// (dirty flags, versions, dependency bookkeeping) stay in ./internal.
//
// Signals are callable: `count()` reads the value. Each factory wraps an
// internal node in a function and keeps the node in a closure, so users
// cannot reach the internals, not even with a cast.

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

/** Wrap an internal node in a callable read-only signal. */
function readable<T>(node: Readable<T>): ReadonlySignal<T> {
  return () => node.get();
}

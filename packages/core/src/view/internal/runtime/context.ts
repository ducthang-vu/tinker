// A context: the named values a view's template reads, each a signal. The framework
// adds its own (a `@map` row's `$index`, `$count`, …), and a caller adds its own (an
// outlet's values). Both are the same kind of entry, so one type and one way of
// building a scope serve both.

import { signal, type ReadonlySignal } from "../../../signals/index.ts";
import { Scope } from "../template/scope.ts";

/** The names a view's template can read beyond the ones around it, each a signal. */
export type Context = ReadonlyMap<string, ReadonlySignal<unknown>>;

/** A context of plain values: each becomes a signal holding it. */
export function contextOf(values: Readonly<Record<string, unknown>>): Context {
  return new Map(Object.entries(values)
    .map(([name, value]) => [name, signal(value)] as const));
}

/** The scope a template reads: the names around it, with the context's entries on top. */
export function scopeWith(
  component: object,
  around: ReadonlyMap<string, ReadonlySignal<unknown>>,
  context: Context,
): Scope {
  const lets = new Map(around);
  for (const [name, entry] of context) {
    lets.set(name, entry);
  }
  return new Scope(component, lets);
}

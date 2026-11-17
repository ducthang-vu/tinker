// viewChildren: the instances of a type in a component's template, as a signal.

import { inject } from "../../../di/index.ts";
import type { ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ViewQueries } from "../runtime/view-queries.ts";

/** Options of viewChildren: `read: ElementRef` gives the elements instead of the instances. */
export interface ViewChildrenOptions {
  readonly read: typeof ElementRef;
}

/**
 * The instances of `type` in this component's template, in document order: its
 * child components and directives, including those in `@if` branches and `@map`
 * rows. With `{ read: ElementRef }`, the elements they sit on, as ElementRefs.
 * It is a signal, so it follows the template as the template changes. Call it
 * where the component's fields are set, as with `input()`.
 */
export function viewChildren<T extends object>(type: Class<T>): ReadonlySignal<readonly T[]>;
export function viewChildren<T extends object>(
  type: Class<T>,
  options: ViewChildrenOptions,
): ReadonlySignal<readonly ElementRef[]>;
export function viewChildren<T extends object>(
  type: Class<T>,
  options?: ViewChildrenOptions,
): ReadonlySignal<readonly T[] | readonly ElementRef[]> {
  const queries = inject(ViewQueries);
  return options === undefined ? queries.of(type) : queries.elementsOf(type);
}

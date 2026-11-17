// viewChild: the first instance of a type in a component's template, as a signal.

import { inject } from "../../../di/index.ts";
import type { Maybe } from "../../../functional/index.ts";
import type { ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import type { ElementRef } from "../runtime/element-ref.ts";
import { ViewQueries } from "../runtime/view-queries.ts";
import type { ViewChildrenOptions } from "./view-children.ts";

/**
 * The first instance of `type` in this component's template, in document order,
 * or none when there is none: the first of `viewChildren(type)`. With
 * `{ read: ElementRef }`, the element it sits on, as an ElementRef. Call it where
 * the component's fields are set, as with `input()`.
 */
export function viewChild<T extends object>(type: Class<T>): ReadonlySignal<Maybe<T>>;
export function viewChild<T extends object>(
  type: Class<T>,
  options: ViewChildrenOptions,
): ReadonlySignal<Maybe<ElementRef>>;
export function viewChild<T extends object>(
  type: Class<T>,
  options?: ViewChildrenOptions,
): ReadonlySignal<Maybe<T> | Maybe<ElementRef>> {
  const queries = inject(ViewQueries);
  return options === undefined ? queries.first(type) : queries.firstElement(type);
}

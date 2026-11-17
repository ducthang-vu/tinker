// viewChildren: the instances of a type in a component's template, as a signal.

import { inject } from "../../../di/index.ts";
import type { ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ViewQueries } from "../runtime/view-queries.ts";

/**
 * The instances of `type` in this component's template, in document order: its
 * child components and directives, including those in `@if` branches and `@map`
 * rows. It is a signal, so it follows the template as the template changes.
 * Call it where the component's fields are set, as with `input()`.
 */
export function viewChildren<T extends object>(type: Class<T>): ReadonlySignal<readonly T[]> {
  return inject(ViewQueries)
    .of(type);
}

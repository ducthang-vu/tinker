// viewChild: the first instance of a type in a component's template, as a signal.
// `viewChild.required` is the same, for a child that must be there: it returns
// the instance itself, and throws when the template has none.

import { inject } from "../../../di/index.ts";
import { Maybe } from "../../../functional/index.ts";
import { computed, type ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ViewQueries } from "../runtime/view-queries.ts";
import type { ViewChildrenOptions } from "./view-children.ts";

/** Thrown when a required viewChild is read and its template has no match. */
export class ViewChildMissingError extends Error {
  /** @param type The name of the type the template should contain. */
  constructor(type: string) {
    super(`The template has no ${type}, which viewChild.required(${type}) needs`);
    this.name = "ViewChildMissingError";
  }
}

/**
 * The first instance of `type` in this component's template, in document order,
 * or none when there is none: the first of `viewChildren(type)`. With
 * `{ read: ElementRef }`, the element it sits on, as an ElementRef. Call it where
 * the component's fields are set, as with `input()`.
 */
function optionalViewChild<T extends object>(type: Class<T>): ReadonlySignal<Maybe<T>>;
function optionalViewChild<T extends object>(
  type: Class<T>,
  options: ViewChildrenOptions,
): ReadonlySignal<Maybe<ElementRef>>;
function optionalViewChild<T extends object>(
  type: Class<T>,
  options?: ViewChildrenOptions,
): ReadonlySignal<Maybe<T> | Maybe<ElementRef>> {
  const queries = inject(ViewQueries);
  return options === undefined ? queries.first(type) : queries.firstElement(type);
}

/**
 * The first instance of `type` in the template, which must be there: reading it
 * when the template has none throws ViewChildMissingError. With
 * `{ read: ElementRef }`, the element of that instance, as an ElementRef.
 */
function requiredViewChild<T extends object>(type: Class<T>): ReadonlySignal<T>;
function requiredViewChild<T extends object>(
  type: Class<T>,
  options: ViewChildrenOptions,
): ReadonlySignal<ElementRef>;
function requiredViewChild<T extends object>(
  type: Class<T>,
  options?: ViewChildrenOptions,
): ReadonlySignal<T | ElementRef> {
  const first = options === undefined ? optionalViewChild(type) : optionalViewChild(type, options);
  return computed(() => first()
    .getOrThrow(() => new ViewChildMissingError(type.name)));
}

/** `viewChild(Type)`: the first match, as a Maybe. `viewChild.required(Type)`: the match itself. */
export const viewChild = Object.assign(optionalViewChild, { required: requiredViewChild });

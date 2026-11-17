// query and queryAll: the instances of a type in a component's template, as signals.
// `query` is the first match, as a Maybe; `query.required` is the match itself and
// throws when the template has none; `queryAll` is every match, in document order.
// Each takes `{ read: ElementRef }` to give the elements the instances sit on.

import { inject } from "../../../di/index.ts";
import { Maybe } from "@tinker/functional";
import { computed, type ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ViewQueries } from "../runtime/view-queries.ts";

/** Options of query and queryAll: `read: ElementRef` gives the elements, not the instances. */
export interface QueryOptions {
  readonly read: typeof ElementRef;
}

/** Thrown when `query.required` is read and the template has no match. */
export class QueryMissingError extends Error {
  /** @param type The name of the type the template should contain. */
  constructor(type: string) {
    super(`The template has no ${type}, which query.required(${type}) needs`);
    this.name = "QueryMissingError";
  }
}

/**
 * The first instance of `type` in this component's template, in document order,
 * or none when there is none. With `{ read: ElementRef }`, the element it sits on.
 * Call it where the component's fields are set, as with `input()`.
 */
function optionalQuery<T extends object>(type: Class<T>): ReadonlySignal<Maybe<T>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options: QueryOptions,
): ReadonlySignal<Maybe<ElementRef>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<Maybe<T> | Maybe<ElementRef>> {
  const queries = inject(ViewQueries);
  return options === undefined ? queries.first(type) : queries.firstElement(type);
}

/**
 * The first instance of `type` in the template, which must be there: reading it
 * when the template has none throws QueryMissingError. With `{ read: ElementRef }`,
 * the element of that instance.
 */
function requiredQuery<T extends object>(type: Class<T>): ReadonlySignal<T>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options: QueryOptions,
): ReadonlySignal<ElementRef>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<T | ElementRef> {
  const first = options === undefined ? optionalQuery(type) : optionalQuery(type, options);
  return computed(() => first()
    .getOrThrow(() => new QueryMissingError(type.name)));
}

/** `query(Type)`: the first match, as a Maybe. `query.required(Type)`: the match itself. */
export const query = Object.assign(optionalQuery, { required: requiredQuery });

/**
 * The instances of `type` in this component's template, in document order: its
 * child components and directives, including those in `@if` branches and `@map`
 * rows. With `{ read: ElementRef }`, the elements they sit on. It is a signal, so
 * it follows the template as the template changes. Call it where the component's
 * fields are set, as with `input()`. To pick from the list, use its array methods.
 */
export function queryAll<T extends object>(type: Class<T>): ReadonlySignal<readonly T[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options: QueryOptions,
): ReadonlySignal<readonly ElementRef[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<readonly T[] | readonly ElementRef[]> {
  const queries = inject(ViewQueries);
  return options === undefined ? queries.of(type) : queries.elementsOf(type);
}

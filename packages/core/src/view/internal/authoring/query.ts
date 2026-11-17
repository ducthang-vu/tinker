// query and queryAll: the instances of a type, as signals. The source is the
// component's own template (the default) or its content, the children its parent's
// template passes in. `query` is the first match, as a Maybe; `query.required` is the
// match itself and throws when there is none; `queryAll` is every match, in document
// order. `{ read: ElementRef }` gives the elements the instances sit on instead.

import { inject } from "../../../di/index.ts";
import { Maybe } from "@tinker/functional";
import { computed, type ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ContentQueries, ViewQueries } from "../runtime/view-queries.ts";

/** Where a query looks: the component's own template, or the content it was given. */
export type QuerySource = "view" | "content";

/** Options of query and queryAll. `from` is the source, "view" by default. */
export interface QueryOptions {
  readonly from?: QuerySource;
}

/** Options with `read: ElementRef`: the elements the instances sit on, not the instances. */
export interface ElementQueryOptions extends QueryOptions {
  readonly read: typeof ElementRef;
}

/** Thrown when `query.required` is read and there is no match. */
export class QueryMissingError extends Error {
  /** @param type The name of the type the query should find. */
  constructor(type: string) {
    super(`No ${type} found, which query.required(${type}) needs`);
    this.name = "QueryMissingError";
  }
}

/** The registry a query reads: its component's own, or the one of its content. */
function registryOf(options: QueryOptions | undefined): ViewQueries {
  return options?.from === "content" ? inject(ContentQueries) : inject(ViewQueries);
}

/** Whether the options ask for elements (`read: ElementRef`). */
function readsElements(options: QueryOptions | undefined): options is ElementQueryOptions {
  return options !== undefined && "read" in options;
}

/**
 * The first match of `type`, in document order, or none when there is none. Call it
 * where the component's fields are set, as with `input()`.
 */
function optionalQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<Maybe<T>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<Maybe<ElementRef>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<Maybe<T> | Maybe<ElementRef>> {
  const queries = registryOf(options);
  return readsElements(options) ? queries.firstElement(type) : queries.first(type);
}

/**
 * The first match of `type`, which must be there: reading it when there is none
 * throws QueryMissingError.
 */
function requiredQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<T>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<ElementRef>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<T | ElementRef> {
  const queries = registryOf(options);
  const first = readsElements(options) ? queries.firstElement(type) : queries.first(type);
  return computed(() => first()
    .getOrThrow(() => new QueryMissingError(type.name)));
}

/** `query(Type)`: the first match, as a Maybe. `query.required(Type)`: the match itself. */
export const query = Object.assign(optionalQuery, { required: requiredQuery });

/**
 * Every match of `type`, in document order: child components and directives, including
 * those in `@if` branches and `@map` rows. It is a signal, so it follows the template as
 * it changes. To pick from the list, use its array methods.
 */
export function queryAll<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<readonly T[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<readonly ElementRef[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<readonly T[] | readonly ElementRef[]> {
  const queries = registryOf(options);
  return readsElements(options) ? queries.elementsOf(type) : queries.of(type);
}

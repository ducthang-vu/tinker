// query and queryAll: the instances of a type, as signals. The target is a directive
// or component class, or the name of a template variable (`#name`, `#name="exportAs"`,
// `##name`) declared at the top level of the component's template. The source is the
// component's own template (the default) or its content, the children its parent's
// template passes in: the direct ones, or with `descendants: true` the nested ones too.
// `query` is the first match, as a Maybe; `query.required` is the
// match itself and throws when there is none; `queryAll` is every match, in document
// order. `{ read: ElementRef }` gives the elements the instances sit on instead.

import { inject } from "../../../di/index.ts";
import { computed, type ReadonlySignal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { ContentQueries, ViewQueries } from "../runtime/view-queries.ts";
import { CLASS_REPLACEMENTS } from "../tokens.ts";
import { fromNullable, getOrThrow, map, match, use, type Maybe } from "@tinker/functional";

/** Where a query looks: the component's own template, or the content it was given. */
export type QuerySource = "view" | "content";

/**
 * Options of query and queryAll. `from` is the source, "view" by default. With `from: "content"`,
 * `descendants: true` also lists the matches nested in the content (inside a plain element, a
 * `@if` branch, a `@map` row or a `<tk-container>`), not only the direct children.
 */
export interface QueryOptions {
  readonly from?: QuerySource;
  readonly descendants?: boolean;
}

/** Options with `read: ElementRef`: the elements the instances sit on, not the instances. */
export interface ElementQueryOptions extends QueryOptions {
  readonly read: typeof ElementRef;
}

/**
 * Thrown when `query.required` is read and there is no match. `target` is the query as
 * written, e.g. `Item` or `"tab"`.
 */
export class QueryMissingError extends Error {
  constructor(target: string) {
    super(`No ${target} found, which query.required(${target}) needs`);
    this.name = "QueryMissingError";
  }
}

/** The registry a query reads: its component's own, or the one of its content. */
/**
 * The class a query matches: a class replaced by an override is matched as its
 * replacement, the one that is on the page, as the testing helpers do.
 */
function matchedBy<T extends object>(type: Class<T>): Class<T> {
  return (inject(CLASS_REPLACEMENTS)
    .get(type) ?? type) as Class<T>;
}

function registryOf(options: QueryOptions | undefined): ViewQueries {
  return options?.from === "content" ? inject(ContentQueries) : inject(ViewQueries);
}

/** Whether the options ask for the matches nested in the content too (`descendants: true`). */
function descendantsOf(options: QueryOptions | undefined): boolean {
  return options?.descendants === true;
}

/** Whether the options ask for elements (`read: ElementRef`). */
function readsElements(options: QueryOptions | undefined): options is ElementQueryOptions {
  return options !== undefined && "read" in options;
}

/** The value of the template variable `name`, if it is set (the element or instance). */
function namedOf<T>(name: string): ReadonlySignal<Maybe<T>> {
  const value = inject(ViewQueries)
    .reference(name);
  return computed(() => fromNullable(value() as T | undefined));
}

/**
 * The first match, in document order, or none when there is none. Call it where the
 * component's fields are set, as with `input()`.
 */
function optionalQuery<T extends object>(type: Class<T>): ReadonlySignal<Maybe<T>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<Maybe<ElementRef>>;
function optionalQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<Maybe<T>>;
function optionalQuery<T = unknown>(name: string): ReadonlySignal<Maybe<T>>;
function optionalQuery(
  target: Class<object> | string,
  options?: QueryOptions,
): ReadonlySignal<Maybe<unknown>> {
  if (typeof target === "string") {
    return namedOf(target);
  }
  const queries = registryOf(options);
  return readsElements(options)
    ? queries.firstElement(matchedBy(target), descendantsOf(options))
    : queries.first(matchedBy(target), descendantsOf(options));
}

/**
 * The first match, which must be there: reading it when there is none throws
 * QueryMissingError.
 */
function requiredQuery<T extends object>(type: Class<T>): ReadonlySignal<T>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<ElementRef>;
function requiredQuery<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<T>;
function requiredQuery<T = unknown>(name: string): ReadonlySignal<T>;
function requiredQuery(
  target: Class<object> | string,
  options?: QueryOptions,
): ReadonlySignal<unknown> {
  const written = typeof target === "string" ? JSON.stringify(target) : target.name;
  const first = typeof target === "string"
    ? namedOf(target)
    : readsElements(options)
      ? registryOf(options)
          .firstElement(matchedBy(target), descendantsOf(options))
      : registryOf(options)
          .first(matchedBy(target), descendantsOf(options));
  return computed(() => getOrThrow(first(), () => new QueryMissingError(written)));
}

/** `query(Type)`: the first match, as a Maybe. `query.required(Type)`: the match itself. */
export const query = Object.assign(optionalQuery, { required: requiredQuery });

/**
 * Every match of `type`, in document order: child components and directives, including
 * those in `@if` branches and `@map` rows. It is a signal, so it follows the template as
 * it changes. To pick from the list, use its array methods.
 */
export function queryAll<T extends object>(type: Class<T>): ReadonlySignal<readonly T[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options: ElementQueryOptions,
): ReadonlySignal<readonly ElementRef[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<readonly T[]>;
export function queryAll<T extends object>(
  type: Class<T>,
  options?: QueryOptions,
): ReadonlySignal<readonly T[] | readonly ElementRef[]> {
  const queries = registryOf(options);
  return readsElements(options)
    ? queries.elementsOf(matchedBy(type), descendantsOf(options))
    : queries.of(matchedBy(type), descendantsOf(options));
}

// The view queries of a component: the directive and component instances in
// its template, each with the element it sits on. A query (`queryAll`)
// reads them in document order, so it follows the DOM: rows that move, and
// branches that appear or go, all update it. Matches of the component's own
// template are recorded here, including those in its embedded views; the
// template of a child component records its own.

import { Injectable } from "../../../di/index.ts";
import { computed, type ReadonlySignal, type Signal, signal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "./element-ref.ts";
import { fromNullable, match, use, type Maybe } from "@tinker/functional";

interface Match {
  readonly instance: object;
  /** The element the instance is on, or the anchor of its container. */
  readonly element: Node;
}

@Injectable()
export class ViewQueries {
  private readonly matches = signal<readonly Match[]>([]);
  /** Bumped when the DOM is reordered, since the order of the matches may have changed. */
  private readonly order = signal(0);
  private readonly references = new Map<string, Signal<unknown>>();

  /**
   * The value of the template variable `name` declared at the top level of this
   * component's template (`#name`, `#name="exportAs"`, `##name`): set by the builder,
   * read by a query whose target is the name. Created on first use.
   */
  reference(name: string): Signal<unknown> {
    let value = this.references.get(name);
    if (value === undefined) {
      value = signal<unknown>(undefined);
      this.references.set(name, value);
    }
    return value;
  }

  /** Record `instance` on `element`. Returns what removes it again. */
  add(instance: object, element: Node): () => void {
    const match: Match = { instance, element };
    this.matches.update((matches) => [...matches, match]);
    return () => {
      this.matches.update((matches) => matches.filter((other) => other !== match));
    };
  }

  /** The DOM was reordered: the matches may now be in another order. */
  reordered(): void {
    this.order.update((count) => count + 1);
  }

  /** The instances of `type`, in document order. */
  of<T extends object>(type: Class<T>): ReadonlySignal<readonly T[]> {
    const matches = this.matchesOf(type);
    return computed(() => matches()
      .map((match) => match.instance as T));
  }

  /**
   * The elements of the instances of `type`, in document order, as ElementRefs.
   * Instances on a container have no element, so they are not in the list.
   */
  elementsOf<T extends object>(type: Class<T>): ReadonlySignal<readonly ElementRef[]> {
    const matches = this.matchesOf(type);
    return computed(() => matches()
      .filter((match) => match.element instanceof Element)
      .map((match) => new ElementRef(match.element as Element)));
  }

  /** The first instance of `type` in document order, if there is one. */
  first<T extends object>(type: Class<T>): ReadonlySignal<Maybe<T>> {
    const all = this.of(type);
    return computed(() => fromNullable(all()[0]));
  }

  /** The first element of an instance of `type`, as an ElementRef, if there is one. */
  firstElement<T extends object>(type: Class<T>): ReadonlySignal<Maybe<ElementRef>> {
    const all = this.elementsOf(type);
    return computed(() => fromNullable(all()[0]));
  }

  private matchesOf<T extends object>(type: Class<T>): ReadonlySignal<readonly Match[]> {
    return computed(() => {
      this.order();
      return this.matches()
        .filter((match) => match.instance instanceof type)
        .sort((left, right) => documentOrder(left.element, right.element));
    });
  }
}

/**
 * The content queries of a component: the instances its parent's template declares as
 * direct children of its element, recorded by the parent. The component reads them with
 * `query(…, { from: "content" })`. It is the same registry as ViewQueries, a separate
 * token, so the two sources cannot be mixed up.
 */
@Injectable()
export class ContentQueries extends ViewQueries {}

/**
 * Negative when `left` comes first in the document, positive when `right` does,
 * and zero for the same node.
 */
function documentOrder(left: Node, right: Node): number {
  if (left === right) {
    return 0;
  }
  return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

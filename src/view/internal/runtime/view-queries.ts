// The view queries of a component: the directive and component instances in
// its template, each with the element it sits on. A query (`viewChildren`)
// reads them in document order, so it follows the DOM: rows that move, and
// branches that appear or go, all update it. Matches of the component's own
// template are recorded here, including those in its embedded views; the
// template of a child component records its own.

import { Injectable } from "../../../di/index.ts";
import { Maybe } from "../../../functional/index.ts";
import { computed, type ReadonlySignal, signal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { ElementRef } from "./element-ref.ts";

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
    return computed(() => Maybe.fromNullable(all()[0]));
  }

  /** The first element of an instance of `type`, as an ElementRef, if there is one. */
  firstElement<T extends object>(type: Class<T>): ReadonlySignal<Maybe<ElementRef>> {
    const all = this.elementsOf(type);
    return computed(() => Maybe.fromNullable(all()[0]));
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
 * Negative when `left` comes first in the document, positive when `right` does,
 * and zero for the same node.
 */
function documentOrder(left: Node, right: Node): number {
  if (left === right) {
    return 0;
  }
  return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

// The view queries of a component: the directive and component instances in
// its template, each with the element it sits on. A query (`viewChildren`)
// reads them in document order, so it follows the DOM: rows that move, and
// branches that appear or go, all update it. Matches of the component's own
// template are recorded here, including those in its embedded views; the
// template of a child component records its own.

import { Injectable } from "../../../di/index.ts";
import { computed, type ReadonlySignal, signal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";

interface Match {
  readonly instance: object;
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
    return computed(() => {
      this.order();
      return this.matches()
        .filter((match) => match.instance instanceof type)
        .sort((left, right) => documentOrder(left.element, right.element))
        .map((match) => match.instance as T);
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

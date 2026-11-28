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
  /** Whether it is a direct match: a content query lists the others only with `descendants`. */
  readonly direct: boolean;
}

/** A template variable: its name, its value, and the node it is declared on. */
interface Variable {
  readonly name: string;
  readonly value: ReadonlySignal<unknown>;
  readonly node: Node;
}

@Injectable()
export class ViewQueries {
  private readonly matches = signal<readonly Match[]>([]);
  /** Bumped when the DOM is reordered, since the order of the matches may have changed. */
  private readonly order = signal(0);
  private readonly references = new Map<string, Signal<unknown>>();
  /** Every template variable of the template, in blocks too, with the node it is declared on. */
  private readonly variables = signal<readonly Variable[]>([]);

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

  /**
   * Record `instance` on `element`. Returns what removes it again.
   *
   * @param instance The directive or component instance.
   * @param element The element it is on, or the anchor of its container.
   * @param direct Whether it is a direct match (a content registry's direct child), not a
   *   descendant.
   * @returns What removes the record.
   */
  add(instance: object, element: Node, direct = true): () => void {
    const match: Match = { instance, element, direct };
    this.matches.update((matches) => [...matches, match]);
    return () => {
      this.matches.update((matches) => matches.filter((other) => other !== match));
    };
  }

  /**
   * Record the template variable `name`, declared on `node`, whose value is `value`. Returns
   * what removes it again.
   *
   * @param name The variable's name.
   * @param value Its value: the element, or the directive or component, once set.
   * @param node The element (or container anchor) it is declared on, for the document order.
   * @returns What removes the record.
   */
  addVariable(name: string, value: ReadonlySignal<unknown>, node: Node): () => void {
    const variable: Variable = { name, value, node };
    this.variables.update((variables) => [...variables, variable]);
    return () => {
      this.variables.update((variables) => variables.filter((other) => other !== variable));
    };
  }

  /**
   * The values of every template variable `name`, in document order: one for each place the
   * template declares it that is rendered, once its value is set.
   *
   * @param name The variable's name.
   * @returns The values, as a signal.
   */
  named<T>(name: string): ReadonlySignal<readonly T[]> {
    return computed(() => {
      this.order();
      return this.variables()
        .filter((variable) => variable.name === name)
        .sort((left, right) => documentOrder(left.node, right.node))
        .map((variable) => variable.value())
        .filter((value) => value !== undefined) as T[];
    });
  }

  /** The DOM was reordered: the matches may now be in another order. */
  reordered(): void {
    this.order.update((count) => count + 1);
  }

  /**
   * The instances of `type`, in document order.
   *
   * @param type The class matched.
   * @param descendants Whether the matches that are not direct are listed too.
   * @returns The instances, as a signal.
   */
  of<T extends object>(type: Class<T>, descendants = false): ReadonlySignal<readonly T[]> {
    const matches = this.matchesOf(type, descendants);
    return computed(() => matches()
      .map((match) => match.instance as T));
  }

  /**
   * The elements of the instances of `type`, in document order, as ElementRefs.
   * Instances on a container have no element, so they are not in the list.
   */
  elementsOf<T extends object>(
    type: Class<T>,
    descendants = false,
  ): ReadonlySignal<readonly ElementRef[]> {
    const matches = this.matchesOf(type, descendants);
    return computed(() => matches()
      .filter((match) => match.element instanceof Element)
      .map((match) => new ElementRef(match.element as Element)));
  }

  /** The first instance of `type` in document order, if there is one. */
  first<T extends object>(type: Class<T>, descendants = false): ReadonlySignal<Maybe<T>> {
    const all = this.of(type, descendants);
    return computed(() => fromNullable(all()[0]));
  }

  /** The first element of an instance of `type`, as an ElementRef, if there is one. */
  firstElement<T extends object>(
    type: Class<T>,
    descendants = false,
  ): ReadonlySignal<Maybe<ElementRef>> {
    const all = this.elementsOf(type, descendants);
    return computed(() => fromNullable(all()[0]));
  }

  private matchesOf<T extends object>(
    type: Class<T>,
    descendants: boolean,
  ): ReadonlySignal<readonly Match[]> {
    return computed(() => {
      this.order();
      return this.matches()
        .filter((match) => match.instance instanceof type && (descendants || match.direct))
        .sort((left, right) => documentOrder(left.element, right.element));
    });
  }
}

/**
 * The content queries of a component: the instances its parent's template passes in, recorded by
 * the parent: those on the direct children of its element as direct matches, and those nested
 * deeper (in a plain element, a `@if` branch, a `@map` row, a `<tk-container>`) as descendants.
 * The component reads them with `query(…, { from: "content" })`, adding `descendants: true` for
 * the nested ones. It is the same registry as ViewQueries, a separate token, so the two sources
 * cannot be mixed up.
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

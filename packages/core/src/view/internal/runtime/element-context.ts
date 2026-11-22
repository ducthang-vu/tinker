// What Tinker has put on one DOM element: any number of directive instances,
// and at most one component (with the ComponentView rendering its template).
//
// A ComponentView owns the contexts of the elements in its template; the engine maps
// each element to its context, so "what is on this element?" is one lookup.

import type { ComponentView } from "./component-view.ts";
import { Some, None, isSome, isNone, type Maybe } from "@tinker/functional/v1";

export class ElementContext {
  private readonly directiveInstances: object[] = [];
  private component = None.of<ComponentView<unknown>>();

  /** @param element The element this context describes. */
  constructor(readonly element: Element) {}

  /** The directive instances on the element, in the order they were added. */
  get directives(): readonly object[] {
    return this.directiveInstances;
  }

  /** The view of the component on the element, if any. */
  get componentView(): Maybe<ComponentView<unknown>> {
    return this.component;
  }

  /** Whether nothing is on the element (no directives, no component). */
  get isEmpty(): boolean {
    return this.directiveInstances.length === 0 && isNone(this.component);
  }

  addDirective(directive: object): void {
    this.directiveInstances.push(directive);
  }

  /** Take `directive` off the element. Does nothing if it is not there. */
  removeDirective(directive: object): void {
    const index = this.directiveInstances.indexOf(directive);
    if (index !== -1) {
      this.directiveInstances.splice(index, 1);
    }
  }

  /** Put a component on the element. An element can hold only one. */
  attachComponent(view: ComponentView<unknown>): void {
    if (isSome(this.component)) {
      throw new Error("The element already holds a component");
    }
    this.component = Some.of(view);
  }

  /** Remove the component from the element. */
  detachComponent(): void {
    this.component = None.of();
  }
}

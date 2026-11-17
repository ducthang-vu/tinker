// What Tinker has put on one DOM element: any number of directive instances,
// and at most one component (with the ComponentView rendering its template).
//
// A ComponentView owns the contexts of the elements in its template; the engine maps
// each element to its context, so "what is on this element?" is one lookup.

import { Maybe } from "@tinker/functional";
import type { ComponentView } from "./component-view.ts";

export class ElementContext {
  private readonly directiveInstances: object[] = [];
  private component = Maybe.none<ComponentView<unknown>>();

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
    return this.directiveInstances.length === 0 && this.component.isNone();
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
    if (this.component.isSome()) {
      throw new Error("The element already holds a component");
    }
    this.component = Maybe.some(view);
  }

  /** Remove the component from the element. */
  detachComponent(): void {
    this.component = Maybe.none();
  }
}

// What Tinker has put on one DOM element: any number of directive instances,
// and at most one component (with the View rendering its template).
//
// A View owns the contexts of the elements in its template; the engine maps
// each element to its context, so "what is on this element?" is one lookup.

import type { View } from "./view.ts";

export class ElementContext {
  private readonly directiveInstances: object[] = [];
  private component: View<unknown> | undefined;

  /** @param element The element this context describes. */
  constructor(readonly element: Element) {}

  /** The directive instances on the element, in the order they were added. */
  get directives(): readonly object[] {
    return this.directiveInstances;
  }

  /** The view of the component on the element, if any. */
  get componentView(): View<unknown> | undefined {
    return this.component;
  }

  /** Whether nothing is on the element (no directives, no component). */
  get isEmpty(): boolean {
    return this.directiveInstances.length === 0 && !this.component;
  }

  addDirective(directive: object): void {
    this.directiveInstances.push(directive);
  }

  /** Put a component on the element. An element can hold only one. */
  attachComponent(view: View<unknown>): void {
    if (this.component) {
      throw new Error("The element already holds a component");
    }
    this.component = view;
  }

  /** Remove the component from the element. */
  detachComponent(): void {
    this.component = undefined;
  }
}

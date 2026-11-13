// A View: one rendered template, belonging to one component instance.
//
// It ties together where the component lives (its host element), the
// component instance, the DOM nodes rendered for its template, and the
// contexts of the elements in that template (their directives and child
// components). Everything the view owns is destroyed with it: its child
// components' views, anything registered through `addDestroyCallback` (later: the
// watches of its bindings, directive hooks), and finally its nodes.

import { Maybe } from "../functional/index.ts";
import type { ElementContext } from "./element-context.ts";
import type { InputBinding, InputName, InputValue } from "./input.ts";
import type { Renderer } from "./renderer.ts";

export class View<T> {
  private readonly contexts: ElementContext[] = [];
  private readonly destroyCallbacks: (() => void)[] = [];
  /** The inputs of the directives in this view's template, per directive. */
  private readonly directiveInputs = new Map<object, ReadonlyMap<string, InputBinding<unknown>>>();
  private isDestroyed = false;

  /**
   * @param host The element the component is rendered into.
   * @param component The component instance.
   * @param nodes The top-level nodes rendered into `host` for its template.
   * @param renderer Used to remove the nodes on destroy.
   */
  constructor(
    readonly host: Element,
    readonly component: T,
    readonly nodes: readonly Node[],
    private readonly renderer: Renderer,
  ) {}

  /** Whether `destroy()` has been called. */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  /** The contexts of the elements in this view's template that have something on them. */
  get elements(): readonly ElementContext[] {
    return this.contexts;
  }

  /** Record the context of an element declared in this view's template. */
  addElement(context: ElementContext): void {
    this.contexts.push(context);
  }

  /**
   * Record the inputs of a directive in this view's template. The view's
   * watch binds them from the template's bindings.
   */
  addInputs(directive: object, inputs: ReadonlyMap<string, InputBinding<unknown>>): void {
    this.directiveInputs.set(directive, inputs);
  }

  /** The input `name` of `directive`, if the directive is in this view and has that input. */
  input(directive: object, name: string): Maybe<InputBinding<unknown>> {
    return Maybe.fromNullable(this.directiveInputs.get(directive)).flatMap((inputs) =>
      Maybe.fromNullable(inputs.get(name)),
    );
  }

  /**
   * Set an input of this view's component, e.g. `view.setInput("title", "Hello")`.
   * For code creating components itself (and later the parent view's watch,
   * for a binding on the component's host element). Everything reading the
   * input (computeds, the view's watch) sees the new value, like any signal.
   * Throws if the component has no such input.
   */
  setInput<K extends InputName<T>>(name: K, value: InputValue<T[K]>): void {
    this.input(this.component as object, name)
      .getOrThrow(() => new Error(`${(this.component as object).constructor.name} has no input "${name}"`))
      .bind(value);
  }

  /** Run `callback` when the view is destroyed (right away if it already is). */
  addDestroyCallback(callback: () => void): void {
    if (this.isDestroyed) {
      callback();
      return;
    }
    this.destroyCallbacks.push(callback);
  }

  /**
   * Destroy the view: first the views of the components on its elements,
   * then its destroy callbacks (most recent first), then remove its nodes
   * from the host. Calling it again does nothing.
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    for (const context of this.contexts) {
      context.componentView.ifSome((view) => view.destroy());
    }
    for (const callback of this.destroyCallbacks.splice(0).reverse()) {
      callback();
    }
    for (const node of this.nodes) {
      this.renderer.removeChild(this.host, node);
    }
  }
}

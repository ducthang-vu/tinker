// A ComponentView: one rendered template, belonging to one component instance.
//
// It ties together where the component lives (its host element), the
// component instance, the DOM nodes rendered for its template, and the
// contexts of the elements in that template (their directives and child
// components). Everything the view owns is destroyed with it: its child
// components' views, anything registered through `addDestroyCallback` (later: the
// watches of its bindings, directive hooks), and finally its nodes.

import { inject, Injectable } from "../../../di/index.ts";
import { type Either, Left, map, Right, Some, None, fromNullable, flatMap, match, use, type Maybe, pipe } from "@tinker/functional";
import type { ElementContext } from "./element-context.ts";
import type { InputBinding, InputName, InputValue } from "../authoring/input.ts";
import type { Renderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";
import type { View } from "./view.ts";
import type { ViewNode } from "./schedulers/view-scheduler.ts";

/** Creates views, with the app's renderer. */
@Injectable()

export class ComponentViewFactory {
  private readonly renderer = inject(RENDERER);

  /** A view of `component`, rendered as `nodes` into `host`. */
  create<T>(host: Element, component: T, nodes: readonly Node[], node: ViewNode): ComponentView<T> {
    return new ComponentView(host, component, nodes, this.renderer, node);
  }
}

/**
 * What one render of a template creates, in a component's view: the element contexts of its
 * template, the watch that updates it, its directives and child components, and their destroy
 * callbacks. Destroying it leaves the component itself (its injector, its state) alone, so its
 * template can be rendered again. Inputs are recorded on the component's view, where its
 * bindings look them up.
 */
export class RenderScope implements View {
  private readonly callbacks: (() => void)[] = [];
  private readonly contexts: ElementContext[] = [];
  private isDestroyed = false;

  constructor(
    private readonly owner: Pick<View, "addInputs">,
    readonly node: ViewNode,
  ) {}

  /** Run `callback` when the scope is destroyed (right away if it already is). */
  addDestroyCallback(callback: () => void): void {
    if (this.isDestroyed) {
      callback();
      return;
    }
    this.callbacks.push(callback);
  }

  /** Record the inputs of a directive in the template: its component's view looks them up. */
  addInputs(directive: object, inputs: ReadonlyMap<string, InputBinding<unknown>>): void {
    this.owner.addInputs(directive, inputs);
  }

  /** Record the context of an element of the template. */
  addElement(context: ElementContext): void {
    this.contexts.push(context);
  }

  /**
   * Destroy the scope: the views of the components on its elements, then its destroy callbacks
   * (most recent first). Calling it again does nothing.
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    for (const context of this.contexts.splice(0)) {
      use(context.componentView, { Some: (view) => view.destroy(), None: () => undefined });
    }
    for (const callback of this.callbacks.splice(0)
      .reverse()) {
      callback();
    }
  }
}

export class ComponentView<T> implements View {
  private readonly contexts: ElementContext[] = [];
  private readonly destroyCallbacks: (() => void)[] = [];
  /** The top-level nodes rendered into the host: replaced when the template is rendered again. */
  private current: readonly Node[];
  /** The render scope of the current render of the template. */
  private scope?: RenderScope;
  private rerenderer?: (next?: object) => void;
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
    nodes: readonly Node[],
    private readonly renderer: Renderer,
    /** The view's place in the view tree, for the order of its updates. */
    readonly node: ViewNode,
  ) {
    this.current = nodes;
  }

  /** The top-level nodes of the current render, rendered into the host. */
  get nodes(): readonly Node[] {
    return this.current;
  }

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
    return pipe(
      fromNullable(this.directiveInputs.get(directive)),
      flatMap((inputs) => fromNullable(inputs.get(name))),
    );
  }

  /**
   * Set an input of this view's component, e.g. `view.setInput("title", "Hello")`.
   * For code creating components itself (and later the parent view's watch,
   * for a binding on the component's host element). Everything reading the
   * input (computeds, the view's watch) sees the new value, like any signal.
   * An error, with nothing set, if the component has no such input.
   */
  setInput<K extends InputName<T>>(name: K, value: InputValue<T[K]>): Either<void, Error> {
    return map(this.inputNamed(name), (input) => input.bind(value));
  }

  private inputNamed(name: string): Either<{ bind(value: unknown): void }, Error> {
    return match(this.input(this.component as object, name), { Some: (input) => Right.of(input), None: () => Left.of(new Error(`${(this.component as object).constructor.name} has no input "${name}"`)) });
  }

  /**
   * A render scope of this view: what a render of the template creates goes in it. The current one
   * is destroyed with the view, and by `destroyRender` when the template is rendered again.
   */
  renderScope(): RenderScope {
    const scope = new RenderScope(this, this.node);
    if (this.scope === undefined) {
      this.addDestroyCallback(() => this.scope?.destroy());
    }
    this.scope = scope;
    return scope;
  }

  /** Destroy the current render (its scope), so the template can be rendered again. */
  destroyRender(): void {
    this.scope?.destroy();
  }

  /** Replace the nodes rendered into the host with `nodes`: the old ones are removed. */
  replaceNodes(nodes: readonly Node[]): void {
    for (const node of this.current) {
      this.renderer.removeChild(this.host, node);
    }
    this.current = nodes;
    for (const node of nodes) {
      this.renderer.appendChild(this.host, node);
    }
  }

  /** Whether this view can render its template again: see `rerender`. */
  get renderable(): boolean {
    return this.rerenderer !== undefined;
  }

  /** Set how this view renders its template again: see `rerender`. */
  setRerender(rerender: (next?: object) => void): void {
    this.rerenderer = rerender;
  }

  /**
   * Render the template again, from the same component instance: its state is kept. The current
   * render is destroyed, and the template is built again into the same host. A view that was not
   * given a way to render again throws.
   */
  rerender(next?: object): void {
    if (this.rerenderer === undefined) {
      throw new Error("this view cannot render its template again");
    }
    if (!this.isDestroyed) {
      this.rerenderer(next);
    }
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
      use(context.componentView, { Some: (view) => view.destroy(), None: () => undefined });
    }
    for (const callback of this.destroyCallbacks.splice(0)
      .reverse()) {
      callback();
    }
    for (const node of this.nodes) {
      this.renderer.removeChild(this.host, node);
    }
  }
}

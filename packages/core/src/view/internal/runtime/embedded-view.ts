// An embedded view: the nodes a block renders (an `@if` branch, later an item
// of `@for`), placed in a parent node, after a comment anchor. It has no host
// element of its own, so it is not a component: its nodes are its top-level
// nodes, and destroying it removes them. It has its own watch, which the
// factory that created it attaches (see EmbeddedViewFactory).

import type { InputBinding } from "../authoring/input.ts";
import type { Renderer } from "../renderer.ts";
import type { ElementContext } from "./element-context.ts";
import type { View } from "./view.ts";

import type { ViewNode } from "./schedulers/view-scheduler.ts";
import { Some, None, use } from "@tinker/functional/v1";

export class EmbeddedView implements View {
  private readonly contexts: ElementContext[] = [];
  private readonly destroyCallbacks: (() => void)[] = [];
  private readonly directiveInputs = new Map<object, ReadonlyMap<string, InputBinding<unknown>>>();
  private isDestroyed = false;

  /**
   * @param parent The node the nodes are in (the anchor's parent).
   * @param nodes The top-level nodes it renders, in order.
   * @param renderer Removes the nodes on destroy.
   */
  constructor(
    readonly parent: Node,
    readonly nodes: readonly Node[],
    private readonly renderer: Renderer,
    /** The view's place in the view tree: its owner is the view of the block it is in. */
    readonly node: ViewNode,
  ) {}

  /** Whether `destroy()` has been called. */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  addElement(context: ElementContext): void {
    this.contexts.push(context);
  }

  addInputs(directive: object, inputs: ReadonlyMap<string, InputBinding<unknown>>): void {
    this.directiveInputs.set(directive, inputs);
  }

  addDestroyCallback(callback: () => void): void {
    if (this.isDestroyed) {
      callback();
      return;
    }
    this.destroyCallbacks.push(callback);
  }

  /**
   * Destroy the components on its elements, run its destroy callbacks (most
   * recent first), then remove its nodes. Calling it again does nothing.
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
      this.renderer.removeChild(this.parent, node);
    }
  }
}

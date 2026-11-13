// A ViewContainerRef: a place in the DOM where views are added, moved and
// removed at runtime, in order. The place is marked by an anchor node
// (usually a comment); each view's host element sits just before the anchor,
// in the container's order. Dynamic components use it, and later so will
// `@if` and `@for`.
//
// A view destroyed from anywhere (through the container or directly) leaves
// the container, and its host element is removed from the DOM.

import { Maybe } from "../../functional/index.ts";
import type { Class } from "../../utils/types.ts";
import { inject, Injectable } from "../../di/index.ts";
import { ComponentFactory } from "../factories/component-factory.ts";
import type { Renderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";
import type { View } from "./view.ts";

/** Creates view containers, with the app's component factory and renderer. */
@Injectable()
export class ViewContainerRefFactory {
  private readonly components = inject(ComponentFactory);
  private readonly renderer = inject(RENDERER);

  /** A container inserting its views just before `anchor`. */
  create(anchor: Node): ViewContainerRef {
    return new ViewContainerRef(anchor, this.components, this.renderer);
  }
}

export class ViewContainerRef {
  private readonly views: View<unknown>[] = [];

  /**
   * Created by ViewContainerRefFactory (e.g. through `engine.createViewContainer(anchor)`).
   * @param anchor Where the container is: its views sit just before it.
   * @param components Creates the components this container holds.
   * @param renderer Inserts, moves and removes their host elements.
   */
  constructor(
    readonly anchor: Node,
    private readonly components: ComponentFactory,
    private readonly renderer: Renderer,
  ) {}

  /** How many views the container holds. */
  get length(): number {
    return this.views.length;
  }

  /** The view at `index`, if there is one. */
  get(index: number): Maybe<View<unknown>> {
    return Maybe.fromNullable(this.views[index]);
  }

  /** The position of `view` in the container, or -1. */
  indexOf(view: View<unknown>): number {
    return this.views.indexOf(view);
  }

  /** Create component `type` (in a new host element) and insert it at `index` (default: the end). */
  createComponent<T extends object>(type: Class<T>, index: number = this.length): View<T> {
    this.checkIndex(index, this.length);
    const parent = this.parent();
    const view = this.components.create(type);
    this.views.splice(index, 0, view);
    this.renderer.insertBefore(parent, view.host, this.nodeAfter(index));
    view.addDestroyCallback(() => {
      this.views.splice(this.views.indexOf(view), 1);
      this.renderer.removeChild(parent, view.host);
    });
    return view;
  }

  /** Move `view` (already in this container) to `index`. */
  move(view: View<unknown>, index: number): void {
    const from = this.views.indexOf(view);
    if (from === -1) {
      throw new Error("The view is not in this container");
    }
    this.checkIndex(index, this.length - 1);
    this.views.splice(from, 1);
    this.views.splice(index, 0, view);
    this.renderer.insertBefore(this.parent(), view.host, this.nodeAfter(index));
  }

  /** Destroy the view at `index` (default: the last one). Does nothing if there is none. */
  remove(index: number = this.length - 1): void {
    this.get(index).ifSome((view) => view.destroy());
  }

  /** Destroy all views, last first. */
  clear(): void {
    for (const view of [...this.views].reverse()) {
      view.destroy();
    }
  }

  /** The node before which the view at `index` must sit: the next view's host, or the anchor. */
  private nodeAfter(index: number): Node {
    return this.get(index + 1).match({ some: (view) => view.host, none: () => this.anchor });
  }

  private parent(): Node {
    const parent = this.anchor.parentNode;
    if (!parent) {
      throw new Error("The container's anchor is not in the DOM");
    }
    return parent;
  }

  private checkIndex(index: number, max: number): void {
    if (!Number.isInteger(index) || index < 0 || index > max) {
      throw new RangeError(`Index ${index} is out of range (0 to ${max})`);
    }
  }
}

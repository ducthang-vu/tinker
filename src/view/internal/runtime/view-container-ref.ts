// A ViewContainerRef: a place in the DOM where views are added, moved and
// removed at runtime, in order. The place is marked by an anchor node
// (usually a comment); each view's host element sits just before the anchor,
// in the container's order. Dynamic components use it, and later so will
// `@if` and `@for`.
//
// A view destroyed from anywhere (through the container or directly) leaves
// the container, and its host element is removed from the DOM.

import { Maybe } from "../../../functional/index.ts";
import type { Class } from "../../../utils/types.ts";
import { inject, Injectable, type Injector } from "../../../di/index.ts";
import { ComponentFactory } from "../factories/component-factory.ts";
import { ComponentRef, refOf } from "../component-ref.ts";
import type { Renderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";
import type { View } from "./view.ts";
import type { ComponentView } from "./component-view.ts";
import type { EmbeddedView } from "./embedded-view.ts";
import type { TemplateContext, TemplateRef } from "./template-ref.ts";

/** Creates view containers, with the app's component factory and renderer. */
@Injectable()
export class ViewContainerRefFactory {
  private readonly components = inject(ComponentFactory);
  private readonly renderer = inject(RENDERER);

  /**
   * A container inserting its views just before `anchor`. Its components are
   * created under `parentInjector`. With an `owner`, the container is cleared
   * and its anchor removed when the owner view is destroyed.
   */
  create(anchor: Node, parentInjector: Injector, owner?: View): ViewContainerRef {
    return new ViewContainerRef(anchor, this.components, this.renderer, parentInjector, owner);
  }
}

export class ViewContainerRef {
  private readonly refs: ComponentRef<object>[] = [];
  /** The instances of declared templates, in the order they were created. */
  private readonly embedded: EmbeddedView[] = [];

  /**
   * Created by ViewContainerRefFactory (e.g. through `engine.createViewContainer(anchor)`).
   * @param anchor Where the container is: its views sit just before it.
   * @param components Creates the components this container holds.
   * @param renderer Inserts, moves and removes their host elements.
   * @param parentInjector The injector the components are created under.
   * @param owner If given, the container is disposed with it.
   */
  constructor(
    readonly anchor: Node,
    private readonly components: ComponentFactory,
    private readonly renderer: Renderer,
    private readonly parentInjector: Injector,
    owner?: View,
  ) {
    owner?.addDestroyCallback(() => this.dispose());
  }

  /** How many components the container holds. */
  get length(): number {
    return this.refs.length;
  }

  /** The component at `index`, if there is one. */
  get(index: number): Maybe<ComponentRef<object>> {
    return Maybe.fromNullable(this.refs[index]);
  }

  /** The position of `ref` in the container, or -1. */
  indexOf(ref: ComponentRef<object>): number {
    return this.refs.indexOf(ref);
  }

  /**
   * Create component `type` (in a new host element) and insert it at `index`
   * (default: the end).
   */
  createComponent<T extends object>(type: Class<T>, index: number = this.length): ComponentRef<T> {
    this.checkIndex(index, this.length);
    const parent = this.parent();
    const view = this.components.create(type, undefined, undefined, this.parentInjector);
    const ref = refOf(view);
    this.refs.splice(index, 0, ref);
    this.renderer.insertBefore(parent, ref.host.nativeElement, this.nodeAfter(index));
    view.addDestroyCallback(() => {
      this.refs.splice(this.refs.indexOf(ref), 1);
      this.renderer.removeChild(parent, ref.host.nativeElement);
    });
    return ref;
  }

  /** Move `ref` (already in this container) to `index`. */
  move(ref: ComponentRef<object>, index: number): void {
    const from = this.refs.indexOf(ref);
    if (from === -1) {
      throw new Error("The component is not in this container");
    }
    this.checkIndex(index, this.length - 1);
    this.refs.splice(from, 1);
    this.refs.splice(index, 0, ref);
    this.renderer.insertBefore(this.parent(), ref.host.nativeElement, this.nodeAfter(index));
  }

  /** Destroy the component at `index` (default: the last one). Does nothing if there is none. */
  remove(index: number = this.length - 1): void {
    this.get(index)
      .ifSome((ref) => ref.destroy());
  }

  /**
   * Render an instance of a template declared with `<template #name let-x>`, at
   * the end of the container, with `context` for its `let-` names.
   */
  createEmbeddedView(template: TemplateRef, context: TemplateContext = {}): EmbeddedView {
    const view = template.instantiate(this.anchor, this.parentInjector, context);
    this.embedded.push(view);
    view.addDestroyCallback(() => {
      this.embedded.splice(this.embedded.indexOf(view), 1);
    });
    return view;
  }

  /** Destroy all components and instances, last first. */
  clear(): void {
    for (const view of [...this.embedded].reverse()) {
      view.destroy();
    }
    for (const ref of [...this.refs].reverse()) {
      ref.destroy();
    }
  }

  /** Destroy the views, then remove the anchor: the owner view is being destroyed. */
  private dispose(): void {
    this.clear();
    const parent = this.anchor.parentNode;
    if (parent) {
      this.renderer.removeChild(parent, this.anchor);
    }
  }

  /** The node before which the component at `index` must sit: the next host, or the anchor. */
  private nodeAfter(index: number): Node {
    return this.get(index + 1)
      .match({ some: (ref) => ref.host.nativeElement, none: () => this.anchor });
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

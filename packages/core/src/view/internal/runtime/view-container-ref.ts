// A ViewContainerRef: a place in the DOM where views are added, moved and
// removed at runtime, in order. The place is marked by an anchor node
// (usually a comment); each view's host element sits just before the anchor,
// in the container's order. Dynamic components use it, and later so will
// `@if` and `@for`.
//
// A view destroyed from anywhere (through the container or directly) leaves
// the container, and its host element is removed from the DOM.

import type { Class } from "../../../utils/types.ts";
import { inject, Injectable, Injector, type InjectorRef, type Provider } from "../../../di/index.ts";
import { ComponentFactory } from "../factories/component-factory.ts";
import { ComponentRef, refOf } from "../component-ref.ts";
import type { Renderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";
import type { View } from "./view.ts";
import type { EmbeddedView } from "./embedded-view.ts";
import { type Context, contextOf } from "./context.ts";
import type { TemplateContext, TemplateRef } from "./template-ref.ts";
import type { ComponentView } from "./component-view.ts";
import { type Either, flatMap, Left, map, match, Right, use, Some, None, fromNullable, type Maybe } from "@tinker/functional";

/**
 * What a container is disposed with: it hears that it is destroyed, and its
 * node owns the components the container creates.
 */
export type ContainerOwner = Pick<View, "addDestroyCallback" | "node">;

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
  create(
    anchor: Node,
    parentInjector: Injector,
    owner?: ContainerOwner,
    ownsAnchor = true,
  ): ViewContainerRef {
    return new ViewContainerRef(
      anchor,
      this.components,
      this.renderer,
      parentInjector,
      owner,
      ownsAnchor,
    );
  }
}

export class ViewContainerRef {
  private readonly refs: ComponentRef<object>[] = [];
  /** The instances of declared templates (`createEmbeddedView`), in the order they were made. */
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
    private readonly owner?: ContainerOwner,
    private readonly ownsAnchor = true,
  ) {
    owner?.addDestroyCallback(() => this.dispose());
  }

  /** How many components the container holds. */
  get length(): number {
    return this.refs.length;
  }

  /** The component at `index`, if there is one. */
  get(index: number): Maybe<ComponentRef<object>> {
    return fromNullable(this.refs[index]);
  }

  /** The position of `ref` in the container, or -1. */
  indexOf(ref: ComponentRef<object>): number {
    return this.refs.indexOf(ref);
  }

  /**
   * Create component `type` (in a new host element) and insert it at `index`
   * (default: the end). `providers` are provided to the component and what it
   * contains, on top of the container's injector; they are destroyed with it.
   */
  createComponent<T extends object>(
    type: Class<T>,
    index: number = this.length,
    providers: readonly Provider[] = [],
  ): Either<ComponentRef<T>, Error> {
    return flatMap(this.slotAt(index, this.length), (slot) => this.createIn(type, slot, providers));
  }

  /** Create `type` in `slot`, once the slot is known to be in the DOM and in range. */
  private createIn<T extends object>(
    type: Class<T>,
    { index, parent }: Slot,
    providers: readonly Provider[],
  ): Either<ComponentRef<T>, Error> {
    const scope = Injector.create({ providers, parent: this.parentInjector });
    const created = this.components.create(
      type,
      undefined,
      undefined,
      scope.injector,
      this.owner?.node,
    );
    // A component that cannot be created leaves nothing behind: its scope goes too.
    use(created, { Left: () => scope.destroy(), Right: () => undefined });
    return map(created, (view) => this.insert(view, index, parent, scope));
  }

  /** Insert the created component `view` at `index`, in the container's element. */
  private insert<T extends object>(
    view: ComponentView<T>,
    index: number,
    parent: Node,
    scope: InjectorRef,
  ): ComponentRef<T> {
    const ref = refOf(view);
    this.refs.splice(index, 0, ref);
    this.renderer.insertBefore(parent, ref.host.nativeElement, this.nodeAfter(index));
    view.addDestroyCallback(() => {
      this.refs.splice(this.refs.indexOf(ref), 1);
      this.renderer.removeChild(parent, ref.host.nativeElement);
    });
    view.addDestroyCallback(() => scope.destroy());
    return ref;
  }

  /** Move `ref` (already in this container) to `index`. An error if it is not in the container. */
  move(ref: ComponentRef<object>, index: number): Either<void, Error> {
    const from = this.refs.indexOf(ref);
    if (from === -1) {
      return Left.of(new Error("The component is not in this container"));
    }
    return flatMap(this.slotAt(index, this.length - 1), (slot) => this.moveTo(ref, from, slot));
  }

  /** Put `ref`, at `from` in the container, into `slot`. */
  private moveTo(
    ref: ComponentRef<object>,
    from: number,
    { index, parent }: Slot,
  ): Either<void, Error> {
    this.refs.splice(from, 1);
    this.refs.splice(index, 0, ref);
    this.renderer.insertBefore(parent, ref.host.nativeElement, this.nodeAfter(index));
    return Right.of(undefined);
  }

  /** Destroy the component at `index` (default: the last one). Does nothing if there is none. */
  remove(index: number = this.length - 1): void {
    use(this.get(index), { Some: (ref) => ref.destroy(), None: () => undefined });
  }

  /**
   * Render an instance of a template declared with `<template #name>`, at the end
   * of the container: before its anchor, after what is already there.
   */
  createEmbeddedView(template: TemplateRef, values: TemplateContext): Either<EmbeddedView, Error> {
    return this.embed(template, contextOf(values));
  }

  /**
   * Render an instance of `template` with a context of signals (the outlet's, which it
   * updates in place), at the end of the container.
   */
  embed(template: TemplateRef, context: Context): Either<EmbeddedView, Error> {
    return map(template.instantiate(this.anchor, this.parentInjector, context), (view) =>
      this.adopt(view));
  }

  /** Keep `view` in the container, until it is destroyed. */
  private adopt(view: EmbeddedView): EmbeddedView {
    this.embedded.push(view);
    view.addDestroyCallback(() => {
      this.embedded.splice(this.embedded.indexOf(view), 1);
    });
    return view;
  }

  /** Destroy all instances and components, last first. */
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
    // An anchor the view's own nodes hold (a `<tk-container>`'s) is removed with them.
    const parent = this.anchor.parentNode;
    if (this.ownsAnchor && parent) {
      this.renderer.removeChild(parent, this.anchor);
    }
  }

  /** The node before which the component at `index` must sit: the next host, or the anchor. */
  private nodeAfter(index: number): Node {
    return match(this.get(index + 1), {
      Some: (ref) => ref.host.nativeElement,
      None: () => this.anchor,
    });
  }

  /** The node the container's components go in, or an error if its anchor is not in the DOM. */
  private parent(): Either<Node, Error> {
    const parent = this.anchor.parentNode;
    return parent
      ? Right.of(parent)
      : Left.of(new Error("The container's anchor is not in the DOM"));
  }

  /** Where a component goes at `index`: in range (0 to `max`), with the anchor in the DOM. */
  private slotAt(index: number, max: number): Either<Slot, Error> {
    return flatMap(this.checkIndex(index, max), (checked) =>
      map(this.parent(), (parent) => ({ index: checked, parent })));
  }

  private checkIndex(index: number, max: number): Either<number, Error> {
    return Number.isInteger(index) && index >= 0 && index <= max
      ? Right.of(index)
      : Left.of(new RangeError(`Index ${index} is out of range (0 to ${max})`));
  }
}

/** Where a component goes in a container: its index, and the node it is inserted into. */
interface Slot {
  readonly index: number;
  readonly parent: Node;
}

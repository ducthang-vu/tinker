// The element-level providers: what every element with a directive or a component
// gets from its element injector, so the directives on it and its component all
// inject the same things: its ElementRef (when it is an element), its
// ViewContainerRef, Effects and RenderHooks. One list, used by both factories, so a
// component cannot lack what a directive has.

import { inject, Injectable, Injector, provide, type Provider } from "../../../di/index.ts";
import { Effects } from "../authoring/effects.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import type { Placement } from "../runtime/placement.ts";
import { type ContainerOwner, ViewContainerRef, ViewContainerRefFactory } from "../runtime/view-container-ref.ts";
import type { View } from "../runtime/view.ts";
import type { Renderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";

@Injectable()
export class ElementScope {
  private readonly renderer: Renderer = inject(RENDERER);

  /**
   * The providers of the injector of the element at `placement`. `injector` gives
   * the injector that the containers create their components under; it is read when
   * the container is first injected, so it can be the injector these providers are in.
   * `owner` is the view the containers are disposed with, if there is one.
   */
  providers(
    placement: Placement,
    injector: () => Injector,
    owner?: ContainerOwner,
  ): Provider<unknown>[] {
    return [
      ...(placement.kind === "element"
        ? [provide(ElementRef, { useValue: new ElementRef(placement.element) })]
        : []),
      // Made when something first injects it: its anchor is added then, so an element
      // without such a user gets no extra node.
      provide(ViewContainerRef, {
        useFactory: () => this.containerFor(placement, injector(), owner),
      }),
      Effects,
      RenderHooks,
    ];
  }

  /** The view container of a placement: at the container's anchor, or after the element. */
  private containerFor(
    placement: Placement,
    injector: Injector,
    owner?: ContainerOwner,
  ): ViewContainerRef {
    if (placement.kind === "container") {
      // The anchor is one of the owner's nodes, so the owner removes it.
      return inject(ViewContainerRefFactory)
        .create(placement.anchor, injector, owner, false);
    }
    return this.containerAt(placement.element, injector, owner);
  }

  /**
   * A view container at `element`: its anchor, a comment, is inserted right
   * after the element, and its views are created under `injector` (the
   * element's own), and disposed with `owner`.
   */
  private containerAt(
    element: Element,
    injector: Injector,
    owner?: ContainerOwner,
  ): ViewContainerRef {
    const anchor = this.renderer.createComment("");
    const parent = element.parentNode;
    if (parent) {
      this.renderer.insertBefore(parent, anchor, element.nextSibling);
    }
    return inject(ViewContainerRefFactory)
      .create(anchor, injector, owner);
  }
}

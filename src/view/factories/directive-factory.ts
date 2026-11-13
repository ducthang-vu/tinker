// The directive factory: the part of creating a directive that every
// directive shares, components included (a component is a directive with a
// template, see ComponentFactory).
//
// - `create()` makes an attribute directive on an existing element: it
//   creates the instance, registers it in the element's context, records its
//   inputs in the view (whose watch binds them), and applies its host bindings.
// - `applyHost()` applies only the host bindings, for instances created
//   elsewhere (the component factory creates components itself).
//
// Everything is tied to a View: when it is destroyed, the listeners are
// removed and the directive leaves its element's context.
//
// A directive has no watch of its own: the watch of the view it belongs to
// updates it (see ComponentFactory).

import { inject, Injectable, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import type { Class } from "../../utils/types.ts";
import { type DirectiveMetadata, getDirectiveMetadata } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { inputsOf } from "../authoring/input.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import type { View } from "../runtime/view.ts";
import type { AttributeNode } from "../template/ast.ts";
import { RENDERER } from "../tokens.ts";
import { HostBindings } from "./host-bindings.ts";

@Injectable()
export class DirectiveFactory {
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly injector = inject(Injector);
  /** Parsed host bindings, per class: each `host` option is parsed only once. */
  private readonly hostBindings = new WeakMap<Class<unknown>, HostBindings>();

  /** The @Directive metadata of `type` (components included). Throws if it is not a directive. */
  metadataOf(type: Class<unknown>): DirectiveMetadata {
    return getDirectiveMetadata(type)
      .getOrThrow(
        () => new Error(`${type.name} is not a directive: decorate it with @Directive`),
      );
  }

  /**
   * Create the directives `types` of `element`, as part of `view`, in the
   * element's own injector (a child of `parent`): the directives are its
   * providers, so they can inject each other, and so can the directives of
   * the element's descendants, whose injectors are children of this one. It
   * also provides ElementRef, its own Effects and RenderHooks, and the
   * directives' `providers` (after those, so they cannot replace them; for a
   * token several directives provide, the first in `types` wins). Each
   * directive is registered in the element's context, its host bindings are
   * applied, and its inputs whose name matches a plain attribute of the
   * element (`text="Hello"`) get that value. Destroying `view` undoes it all
   * and destroys the injector.
   *
   * Returns the element's injector: the parent for its descendants'.
   */
  createOnElement(
    types: readonly Class<object>[],
    element: Element,
    view: View<unknown>,
    parent: Injector,
    attributes: readonly AttributeNode[] = [],
  ): { readonly injector: Injector; readonly instances: readonly object[] } {
    const elementInjector = Injector.create({
      providers: [
        ...types,
        provide(ElementRef, { useValue: new ElementRef(element) }),
        Effects,
        RenderHooks,
        ...types.flatMap((type) => this.metadataOf(type).providers ?? []),
      ],
      parent,
    });
    view.addDestroyCallback(() => elementInjector.destroy());
    const instances = types.map((type) => {
      const instance = runInInjectionContext(elementInjector.injector, () => inject(type));
      this.attach(type, instance, element, view);
      bindAttributes(instance, attributes);
      return instance;
    });
    return { injector: elementInjector.injector, instances };
  }

  /**
   * Create directive `type` on `element`, as part of `view`, in an element
   * injector of its own (child of the engine's). See `createOnElement`.
   */
  create<T extends object>(type: Class<T>, element: Element, view: View<unknown>): T {
    return this.createOnElement([type], element, view, this.injector).instances[0] as T;
  }

  /**
   * Attach directive `instance` (created elsewhere, e.g. a component's host
   * directive) to `element`, as part of `view`: register it in the element's
   * context and its inputs in `view`, and apply its host bindings. Destroying
   * `view` undoes it.
   */
  attach<T extends object>(
    type: Class<T>,
    instance: T,
    element: Element,
    view: View<unknown>,
  ): void {
    const context = this.contexts.getOrCreate(element);
    context.addDirective(instance);
    view.addDestroyCallback(() => {
      context.removeDirective(instance);
      this.contexts.forgetIfEmpty(context);
    });
    view.addInputs(instance, inputsOf(instance));
    this.applyHost(type, instance, element, view);
  }

  /** Apply the host bindings of `type` for `instance` on `element`, until `view` is destroyed. */
  applyHost<T extends object>(
    type: Class<T>,
    instance: T,
    element: Element,
    view: View<unknown>,
  ): void {
    this.hostBindingsOf(type)
      .attach(instance, element, this.renderer, view);
  }

  private hostBindingsOf(type: Class<unknown>): HostBindings {
    let bindings = this.hostBindings.get(type);
    if (!bindings) {
      bindings = new HostBindings(this.metadataOf(type).host);
      this.hostBindings.set(type, bindings);
    }
    return bindings;
  }
}

/**
 * Bind each input of `instance` named like a plain attribute to the
 * attribute's value (compared case-insensitively: the browser's parser
 * lowercases attribute names).
 */
function bindAttributes(instance: object, attributes: readonly AttributeNode[]): void {
  const inputs = [...inputsOf(instance)];
  for (const attribute of attributes) {
    Maybe.fromNullable(inputs.find(([name]) => name.toLowerCase() === attribute.name.toLowerCase()))
      .ifSome(([, input]) => input.bind(attribute.value));
  }
}

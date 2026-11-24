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
// Everything is tied to a ComponentView: when it is destroyed, the listeners are
// removed and the directive leaves its element's context.
//
// A directive has no watch of its own: the watch of the view it belongs to
// updates it (see ComponentFactory).

import { inject, Injectable, Injector, type InjectorRef, provide, runInInjectionContext } from "../../../di/index.ts";
import type { Class } from "../../../utils/types.ts";
import { type DirectiveMetadata, getDirectiveMetadata } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { bindInputsToAttributes, inputsOf, type AttributeReport } from "../authoring/input.ts";
import { endOutputs } from "../authoring/output.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { ElementPlacement, type Placement } from "../runtime/placement.ts";
import { ElementScope } from "./element-scope.ts";
import { type Binding, BindingFactory } from "../runtime/text-binding.ts";
import { Scope } from "../template/scope.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import type { AttributeNode } from "../template/ast.ts";
import { RENDERER } from "../tokens.ts";
import { HostBindings } from "./host-bindings.ts";
import type { View } from "../runtime/view.ts";
import { type Either, flatMap, Left, map, mapLeft, Right, valueOrThrow, Some, None, match, partial } from "@tinker/functional";

@Injectable()
export class DirectiveFactory {
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly bindingFactory = inject(BindingFactory);
  private readonly elementScope = inject(ElementScope);
  private readonly injector = inject(Injector);
  /** Parsed host bindings, per class: each `host` option is parsed only once. */
  private readonly hostBindings = new WeakMap<Class<unknown>, HostBindings>();

  /** The @Directive metadata of `type` (components included), or an error if it is not one. */
  metadataOf(type: Class<unknown>): Either<DirectiveMetadata, Error> {
    return match(getDirectiveMetadata(type), { Some: (metadata) => Right.of(metadata), None: () => Left.of(new Error(`${type.name} is not a directive: decorate it with @Directive`)) });
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
  createOnPlacement(
    types: readonly Class<object>[],
    placement: Placement,
    view: View,
    parent: Injector,
    attributes: readonly AttributeNode[] = [],
    report?: AttributeReport,
  ): {
    readonly injector: Injector;
    readonly instances: readonly object[];
    /** The directives' host bindings, for the view's watch to update. */
    readonly bindings: readonly Binding[];
  } {
    const elementInjector: InjectorRef = Injector.create({
      providers: [
        ...types,
        ...this.elementScope.providers(placement, () => elementInjector.injector, view),
        ...types.flatMap((type) => valueOrThrow(this.metadataOf(type)).providers ?? []),
      ],
      parent,
    });
    view.addDestroyCallback(() => elementInjector.destroy());
    const bindings: Binding[] = [];
    const instances = types.map((type) => {
      const instance = runInInjectionContext(elementInjector.injector, () => inject(type));
      bindings.push(...(placement.kind === "element"
        ? this.attach(type, instance, placement.element, view)
        : this.attachToAnchor(type, instance, view)));
      bindInputsToAttributes(instance, attributes, report);
      return instance;
    });
    return { injector: elementInjector.injector, instances, bindings };
  }

  /**
   * Create directive `type` on `element`, as part of `view`, in an element
   * injector of its own (child of the engine's). See `createOnPlacement`.
   */
  create<T extends object>(type: Class<T>, element: Element, view: View): T {
    return this.createOnPlacement([type], new ElementPlacement(element), view, this.injector)
      .instances[0] as T;
  }

  /**
   * A directive on a `<tk-container>`: it has no element, so it cannot have host
   * bindings. Its outputs are over with it, and its inputs are its own.
   */
  private attachToAnchor<T extends object>(type: Class<T>, instance: T, view: View): Binding[] {
    if (Object.keys(valueOrThrow(this.metadataOf(type)).host ?? {}).length > 0) {
      throw new Error(`${type.name} has host bindings, so it needs an element: it cannot be on <tk-container>`);
    }
    view.addDestroyCallback(partial(endOutputs, instance));
    view.addInputs(instance, inputsOf(instance));
    return [];
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
    view: View,
  ): Binding[] {
    const context = this.contexts.getOrCreate(element);
    context.addDirective(instance);
    view.addDestroyCallback(() => {
      context.removeDirective(instance);
      this.contexts.forgetIfEmpty(context);
    });
    // Its outputs are over when it is: the templates subscribed to them are told.
    view.addDestroyCallback(partial(endOutputs, instance));
    view.addInputs(instance, inputsOf(instance));
    return this.applyHost(type, instance, element, view);
  }

  /**
   * Apply the host bindings of `type` for `instance` on `element`, until
   * `view` is destroyed: its listeners now, and its class bindings returned,
   * for the view's watch to update (they read `instance`).
   */
  applyHost<T extends object>(
    type: Class<T>,
    instance: T,
    element: Element,
    view: View,
  ): Binding[] {
    const hostBindings = this.hostBindingsOf(type);
    hostBindings.attach(instance, element, this.renderer, view);
    return [
      ...hostBindings.classes.map(({ name, expression }) =>
        this.bindingFactory.classToggle(element, name, expression, new Scope(instance))),
      ...hostBindings.styles.map(({ name, expression }) =>
        this.bindingFactory.style(element, name, expression, new Scope(instance))),
      ...hostBindings.attributes.map(({ name, expression }) =>
        this.bindingFactory.attribute(element, name, expression, new Scope(instance))),
    ];
  }

  /**
   * The parsed `host` option of `type` (components included), parsed once. An
   * invalid option, or a class that is not a directive, is a Left.
   */
  hostOf(type: Class<unknown>): Either<HostBindings, Error> {
    const cached = this.hostBindings.get(type);
    if (cached) {
      return Right.of(cached);
    }
    return flatMap(this.metadataOf(type), (metadata) =>
      map(mapLeft(HostBindings.parse(metadata.host), (error): Error => error), (bindings) => {
        this.hostBindings.set(type, bindings);
        return bindings;
      }));
  }

  private hostBindingsOf(type: Class<unknown>): HostBindings {
    // The template builder does not return errors yet. Every directive a component's
    // template names is checked by `hostOf` (through ComponentFactory) before anything is
    // created, so this throw is not reached for them.
    return valueOrThrow(this.hostOf(type));
  }
}

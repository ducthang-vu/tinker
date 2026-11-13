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

import { inject, Injectable, Injector, runInInjectionContext } from "../../di/index.ts";
import type { Class } from "../../utils/types.ts";
import { inputsOf } from "../authoring/input.ts";
import { type DirectiveMetadata, getDirectiveMetadata } from "../authoring/decorators.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { RENDERER } from "../tokens.ts";
import type { View } from "../runtime/view.ts";
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
    return getDirectiveMetadata(type).getOrThrow(
      () => new Error(`${type.name} is not a directive: decorate it with @Directive`),
    );
  }

  /**
   * Create directive `type` on `element`, as part of `view`: the instance is
   * registered in the element's context and its host bindings are applied.
   * Destroying `view` removes both.
   */
  create<T extends object>(type: Class<T>, element: Element, view: View<unknown>): T {
    // In the engine's injection context, so the directive can use inject() and effect().
    const instance = runInInjectionContext(this.injector, () => new type());
    const context = this.contexts.getOrCreate(element);
    context.addDirective(instance);
    view.addDestroyCallback(() => {
      context.removeDirective(instance);
      this.contexts.forgetIfEmpty(context);
    });
    view.addInputs(instance, inputsOf(instance));
    this.applyHost(type, instance, element, view);
    return instance;
  }

  /** Apply the host bindings of `type` for `instance` on `element`, until `view` is destroyed. */
  applyHost<T extends object>(type: Class<T>, instance: T, element: Element, view: View<unknown>): void {
    this.hostBindingsOf(type).attach(instance, element, this.renderer, view);
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

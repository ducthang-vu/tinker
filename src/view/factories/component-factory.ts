// The component factory: everything needed to turn a component class into a
// rendered View.
//
// Given a host element (or creating one from the component's selector), it
// creates the component's own injector (child of the engine's: its host
// directives, ELEMENT, its own Effects and RenderHooks, and its and its host
// directives' `providers`, all destroyed with the view), creates the host
// directives then the component in it, parses its template (once per class), builds the
// DOM through the Renderer, attaches the resulting View to the host's
// ElementContext, and applies the component's host bindings (through the
// DirectiveFactory: a component is a directive with a template).
//
// Reactivity is per view, not per directive: every view gets ONE watch,
// destroyed with the view. It evaluates everything the template binds, in
// template order: today its `{{ }}` texts; later also the inputs of the
// directives on its elements, and their host bindings. Directives have no
// watch of their own, so a directive never runs before the parent has set
// its inputs. (Re-evaluating a whole view is cheap; only changed values
// touch the DOM.) The first run happens during `create`, so the view is
// complete when returned; later runs are queued in `changeDetection.views`.
//
// Signals are the only trigger: a view re-runs when a signal its watch read
// changes, and for no other reason (no zone, no re-run after listeners, no
// markForCheck). A plain field changed in a handler does not update the view:
// make it a signal. (Re-running a view after its listeners fire, as Angular
// does, could be added later without changing the rest.)
//
// Rendered so far: elements, plain attributes, text with `{{ }}`
// interpolations (see template/expression.ts for what expressions can do),
// and the directives the component imports, on the elements matching their
// selectors (see TemplateBuilder.createDirectives). Attribute bindings
// (`[prop]`, `(event)`) and child components come next; binding syntax in
// attributes, and imported components matching an element, are reported as
// unsupported until then.

import {
  inject,
  Injectable,
  Injector,
  type InjectorRef,
  provide,
  runInInjectionContext,
} from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import { watch } from "../../signals/index.ts";
import type { Class } from "../../utils/types.ts";
import { type ComponentMetadata, getComponentMetadata } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { inputsOf } from "../authoring/input.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { RunFirstNow } from "../runtime/run-first-now.ts";
import { type View, ViewFactory } from "../runtime/view.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import { type CompiledNode, compileTemplate, type DirectiveCandidate } from "../template/compile.ts";
import { Selector } from "../template/selector.ts";
import { ELEMENT, RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import { type TemplateBuilder, TemplateBuilderFactory } from "./template-builder.ts";

/**
 * A selector a host element can be created from: an optional tag, then an
 * optional `[attribute]`.
 */
const HOST_SELECTOR = /^([a-z][a-z0-9-]*)?(?:\[([^\]=\s]+)\])?$/i;

@Injectable()
export class ComponentFactory {
  private readonly parser = inject(TEMPLATE_PARSER);
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly directives = inject(DirectiveFactory);
  private readonly builders = inject(TemplateBuilderFactory);
  private readonly views = inject(ViewFactory);
  private readonly changeDetection = inject(ChangeDetection);
  private readonly injector = inject(Injector);
  /** Compiled templates, per component class: each template is parsed and compiled only once. */
  private readonly templates = new WeakMap<Class<unknown>, readonly CompiledNode[]>();

  /** The @Component metadata of `type`. Throws if it is not a component. */
  metadataOf(type: Class<unknown>): ComponentMetadata {
    return getComponentMetadata(type)
      .getOrThrow(
        () => new Error(`${type.name} is not a component: decorate it with @Component`),
      );
  }

  /**
   * Render component `type` into `host`. Without a host, a new (detached)
   * element is created from the component's selector: `tk-child` gives
   * `<tk-child>`, `[child]` gives `<div child>`, `tk-child[x]` gives `<tk-child x>`.
   */
  create<T extends object>(type: Class<T>, host?: Element): View<T> {
    const metadata = this.metadataOf(type);
    host ??= this.createHost(metadata.selector, type);
    if (this.contexts.get(host)
      .flatMap((existing) => existing.componentView)
      .isSome()) {
      throw new Error(`The host element of ${type.name} already holds a component`);
    }

    // Its own injector, child of the engine's: its host directives, its host
    // element (ELEMENT), its own Effects and RenderHooks (so what it registers
    // through them stops when it is destroyed), then the component's and its
    // host directives' providers (after, so they cannot replace the others).
    // The component is created in it, so its inject() calls resolve there first.
    const hostDirectives = this.hostDirectivesOf(type, metadata);
    const ownInjector = Injector.create({
      providers: [
        ...hostDirectives,
        provide(ELEMENT, { useValue: host }),
        Effects,
        RenderHooks,
        ...(metadata.providers ?? []),
        ...hostDirectives.flatMap((directive) =>
          this.directives.metadataOf(directive).providers ?? []),
      ],
      parent: this.injector,
    });
    const { instance, hostInstances, rendered, template } = this.createAndBuild(
      type,
      metadata,
      hostDirectives,
      ownInjector,
    );
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    const view = this.views.create(host, instance, rendered);
    view.addDestroyCallback(() => ownInjector.destroy());
    // The component's inputs live on its own view: `view.setInput` binds them.
    view.addInputs(instance, inputsOf(instance));
    // Its host directives, on its host element.
    hostDirectives.forEach((directive, i) =>
      this.directives.attach(directive, hostInstances[i]!, host, view));
    // The directives of the template's elements, now that their view exists
    // (and before the first render, so plain attributes bound their inputs).
    try {
      template.createDirectives(view, ownInjector.injector);
    } catch (error) {
      view.destroy(); // undoes the directives created so far, and the injectors
      throw error;
    }
    // The view's one watch: updates the bindings in template order. (Later
    // also the inputs of its directives and their host bindings.) Its first
    // run happens now, so the view is complete when it is returned.
    const firstRun = new RunFirstNow(this.changeDetection.views);
    const viewWatch = watch(() => template.update(), firstRun);
    view.addDestroyCallback(() => viewWatch.destroy());
    firstRun.failure.ifSome((error) => {
      view.destroy(); // nothing half-rendered, and the watch no longer listens
      throw error;
    });
    // The first render happened outside a tick: report it, so the render
    // hooks run in the next tick (e.g. an afterNextRender registered by the component).
    this.changeDetection.viewRendered();
    this.directives.applyHost(type, instance, host, view);
    // Only now, so a failed create leaves no context behind.
    const context = this.contexts.getOrCreate(host);
    context.attachComponent(view);
    view.addDestroyCallback(() => {
      context.detachComponent();
      this.contexts.forgetIfEmpty(context);
    });
    return view;
  }

  /**
   * Create the instance in `ownInjector`, and build its template. If either
   * fails, `ownInjector` is destroyed (no view exists yet to do it).
   */
  private createAndBuild<T extends object>(
    type: Class<T>,
    metadata: ComponentMetadata,
    hostDirectives: readonly Class<object>[],
    ownInjector: InjectorRef,
  ): { instance: T; hostInstances: object[]; rendered: Node[]; template: TemplateBuilder } {
    try {
      // Host directives first, in order, so the component can inject them.
      const { hostInstances, instance } = runInInjectionContext(ownInjector.injector, () => ({
        hostInstances: hostDirectives.map((directive) => inject(directive)),
        instance: new type(),
      }));
      const template = this.builders.create(instance);
      const rendered = template.build(this.templateOf(type, metadata));
      return { instance, hostInstances, rendered, template };
    } catch (error) {
      ownInjector.destroy();
      throw error;
    }
  }

  /** Create a host element for a selector: an optional tag, then an optional `[attribute]`. */
  private createHost(selector: string, type: Class<unknown>): Element {
    const [, tag = "div", attribute] = Maybe.fromNullable(HOST_SELECTOR.exec(selector))
      .filter(([, tagName, attributeName]) => tagName !== undefined || attributeName !== undefined)
      .getOrThrow(() => new Error(`Cannot create a host element for ${type.name} from selector "${selector}"`));
    const host = this.renderer.createElement(tag);
    if (attribute) {
      this.renderer.setAttribute(host, attribute, "");
    }
    return host;
  }

  /** The host directives of `type`. Throws for one that is not a directive, or is a component. */
  private hostDirectivesOf(
    type: Class<unknown>,
    metadata: ComponentMetadata,
  ): readonly Class<object>[] {
    const hostDirectives = metadata.hostDirectives ?? [];
    for (const directive of hostDirectives) {
      this.directives.metadataOf(directive);
      if (getComponentMetadata(directive)
        .isSome()) {
        throw new Error(`${directive.name} is a component: it cannot be a host directive of ${type.name}`);
      }
    }
    return hostDirectives;
  }

  /**
   * The compiled template of `type`, its elements matched against the
   * directives it imports: compiled on first use, then cached per class.
   */
  private templateOf(type: Class<unknown>, metadata: ComponentMetadata): readonly CompiledNode[] {
    let nodes = this.templates.get(type);
    if (!nodes) {
      const parsed = this.parser.parse(metadata.template);
      nodes = compileTemplate(parsed, this.candidatesOf(type, metadata));
      this.templates.set(type, nodes);
    }
    return nodes;
  }

  /**
   * The directives `type` imports, with their parsed selectors. Throws for
   * one that is not a directive, or whose selector is not supported.
   */
  private candidatesOf(type: Class<unknown>, metadata: ComponentMetadata): DirectiveCandidate[] {
    return (metadata.imports ?? []).map((imported) => ({
      type: imported,
      selector: Selector.parse(this.directives.metadataOf(imported).selector)
        .mapLeft((error) => new Error(`${imported.name}, imported by ${type.name}: ${error.message}`))
        .getOrThrow(),
      isComponent: getComponentMetadata(imported)
        .isSome(),
    }));
  }
}

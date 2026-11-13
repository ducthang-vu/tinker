// The component factory: everything needed to turn a component class into a
// rendered View.
//
// Given a host element (or creating one from the component's selector), it
// creates the component, parses its template (once per class), builds the
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
// complete when returned; later runs go through the app's ViewScheduler.
//
// Signals are the only trigger: a view re-runs when a signal its watch read
// changes, and for no other reason (no zone, no re-run after listeners, no
// markForCheck). A plain field changed in a handler does not update the view:
// make it a signal. (Re-running a view after its listeners fire, as Angular
// does, could be added later without changing the rest.)
//
// Rendered so far: elements, plain attributes, and text with `{{ }}`
// interpolations (see template/expression.ts for what expressions can do).
// Attribute bindings (`[prop]`, `(event)`), directives in templates and
// child components come next; binding syntax in attributes is reported as
// unsupported until then.

import { inject, Injectable } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import { watch } from "../../signals/index.ts";
import type { Class } from "../../utils/types.ts";
import { type ComponentMetadata, getComponentMetadata } from "../authoring/decorators.ts";
import { inputsOf } from "../authoring/input.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { RunFirstNow } from "../runtime/run-first-now.ts";
import { type View, ViewFactory } from "../runtime/view.ts";
import { ViewScheduler } from "../runtime/view-scheduler.ts";
import { type CompiledNode, compileTemplate } from "../template/compile.ts";
import { RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import { TemplateBuilderFactory } from "./template-builder.ts";

/** A selector a host element can be created from: an optional tag, then an optional `[attribute]`. */
const HOST_SELECTOR = /^([a-z][a-z0-9-]*)?(?:\[([^\]=\s]+)\])?$/i;

@Injectable()
export class ComponentFactory {
  private readonly parser = inject(TEMPLATE_PARSER);
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly directives = inject(DirectiveFactory);
  private readonly builders = inject(TemplateBuilderFactory);
  private readonly views = inject(ViewFactory);
  private readonly scheduler = inject(ViewScheduler);
  /** Compiled templates, per component class: each template is parsed and compiled only once. */
  private readonly templates = new WeakMap<Class<unknown>, readonly CompiledNode[]>();

  /** The @Component metadata of `type`. Throws if it is not a component. */
  metadataOf(type: Class<unknown>): ComponentMetadata {
    return getComponentMetadata(type).getOrThrow(
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
    if (this.contexts.get(host).flatMap((existing) => existing.componentView).isSome()) {
      throw new Error(`The host element of ${type.name} already holds a component`);
    }

    const instance = new type();
    const template = this.builders.create(instance);
    const rendered = template.build(this.templateOf(type, metadata.template));
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    const view = this.views.create(host, instance, rendered);
    // The component's inputs live on its own view: `view.setInput` binds them.
    view.addInputs(instance, inputsOf(instance));
    // The view's one watch: updates the bindings in template order. (Later
    // also the inputs of its directives and their host bindings.) Its first
    // run happens now, so the view is complete when it is returned.
    const firstRun = new RunFirstNow(this.scheduler);
    const viewWatch = watch(() => template.update(), firstRun);
    view.addDestroyCallback(() => viewWatch.destroy());
    firstRun.failure.ifSome((error) => {
      view.destroy(); // nothing half-rendered, and the watch no longer listens
      throw error;
    });
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

  private templateOf(type: Class<unknown>, source: string): readonly CompiledNode[] {
    let nodes = this.templates.get(type);
    if (!nodes) {
      nodes = compileTemplate(this.parser.parse(source));
      this.templates.set(type, nodes);
    }
    return nodes;
  }
}

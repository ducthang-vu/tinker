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
// scheduled by the app's ViewScheduler and destroyed with the view. It will
// evaluate everything the template binds, in template order: its own
// bindings, the inputs of the directives on its elements, and their host
// bindings. Directives have no watch of their own, so a directive never
// runs before the parent has set its inputs. (Re-evaluating a whole view is
// cheap; only changed values touch the DOM.) Until bindings exist the watch
// reads no signals: it runs once and never again.
//
// Signals are the only trigger: a view re-runs when a signal its watch read
// changes, and for no other reason (no zone, no re-run after listeners, no
// markForCheck). A plain field changed in a handler does not update the view:
// make it a signal. (Re-running a view after its listeners fire, as Angular
// does, could be added later without changing the rest.)
//
// First step: elements, text and plain attributes are rendered. Bindings
// (`[prop]`, `(event)`, `{{ }}`), directives and child components come next.
// Until then, binding syntax in attributes is reported as unsupported, and
// `{{ }}` in text is rendered as written.

import { inject, Injectable } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import { watch } from "../../signals/index.ts";
import type { Class } from "../../utils/types.ts";
import { type ComponentMetadata, getComponentMetadata } from "../decorators.ts";
import { ElementContexts } from "../element-contexts.ts";
import type { TemplateNode } from "../template/ast.ts";
import { RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { View } from "../view.ts";
import { ViewScheduler } from "../view-scheduler.ts";
import { inputsOf } from "../input.ts";
import { DirectiveFactory } from "./directive-factory.ts";

/** A selector a host element can be created from: an optional tag, then an optional `[attribute]`. */
const HOST_SELECTOR = /^([a-z][a-z0-9-]*)?(?:\[([^\]=\s]+)\])?$/i;

@Injectable()
export class ComponentFactory {
  private readonly parser = inject(TEMPLATE_PARSER);
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly directives = inject(DirectiveFactory);
  private readonly scheduler = inject(ViewScheduler);
  /** Parsed templates, per component class: each template is parsed only once. */
  private readonly templates = new WeakMap<Class<unknown>, readonly TemplateNode[]>();

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
    const context = this.contexts.getOrCreate(host);
    if (context.componentView.isSome()) {
      throw new Error(`The host element of ${type.name} already holds a component`);
    }

    const instance = new type();
    const rendered = this.templateOf(type, metadata.template).map((node) => this.build(node));
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    const view = new View(host, instance, rendered, this.renderer);
    // The component's inputs live on its own view: `view.setInput` binds them.
    view.addInputs(instance, inputsOf(instance));
    const viewWatch = watch(() => {
      // Empty for now. Will evaluate the template's bindings, the inputs of
      // its directives and their host bindings, in template order.
    }, this.scheduler);
    view.addDestroyCallback(() => viewWatch.destroy());
    this.directives.applyHost(type, instance, host, view);
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

  private templateOf(type: Class<unknown>, source: string): readonly TemplateNode[] {
    let nodes = this.templates.get(type);
    if (!nodes) {
      nodes = this.parser.parse(source);
      this.templates.set(type, nodes);
    }
    return nodes;
  }

  /** Build the DOM for one template node (and its children). */
  private build(node: TemplateNode): Node {
    if (node.kind === "text") {
      return this.renderer.createText(node.value);
    }
    const element = this.renderer.createElement(node.name);
    for (const attribute of node.attributes) {
      if (/^[[(]/.test(attribute.name)) {
        throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
      }
      this.renderer.setAttribute(element, attribute.name, attribute.value);
    }
    for (const child of node.children) {
      this.renderer.appendChild(element, this.build(child));
    }
    return element;
  }
}

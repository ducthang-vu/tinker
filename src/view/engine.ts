// The engine: starts an app by loading its root component.
//
// `bootstrap(AppComponent)` finds the component's host element in the page
// (by its selector, e.g. `<tk-app></tk-app>` in index.html), creates the
// component, parses its template (once per class) and builds the DOM inside
// the host through the Renderer. The result is a View.
//
// `createComponent(type, host?)` does the actual work, for the root component
// and for any other: given a host element (or creating one from the
// component's selector), it renders the component into it.
//
// The engine maps each element it manages to its ElementContext (the
// directives and the component on it), so "what is on this element?" is
// one lookup: `engine.getContext(element)`.
//
// First step: elements, text and plain attributes are rendered. Bindings
// (`[prop]`, `(event)`, `{{ }}`), directives and child components come next.
// Until then, binding syntax in attributes is reported as unsupported, and
// `{{ }}` in text is rendered as written.

import type { Class } from "../utils/types.ts";
import { getComponentMetadata } from "./decorators.ts";
import { DomRenderer, type Renderer } from "./renderer.ts";
import type { TemplateNode } from "./template/ast.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import type { TemplateParser } from "./template/parser.ts";
import { ElementContext } from "./element-context.ts";
import { View } from "./view.ts";
import { ViewContainerRef } from "./view-container-ref.ts";

/** What the engine is built from. Everything has a browser default. */
export interface EngineOptions {
  /** Where the host element is looked up (default: the global document). */
  readonly document?: Document;
  /** Turns templates into syntax trees (default: the browser's parser). */
  readonly parser?: TemplateParser;
  /** Builds the DOM (default: a DomRenderer on `document`). */
  readonly renderer?: Renderer;
}

export class Engine {
  private readonly document: Document;
  private readonly parser: TemplateParser;
  private readonly renderer: Renderer;
  /** Parsed templates, per component class: each template is parsed only once. */
  private readonly templates = new WeakMap<Class<unknown>, readonly TemplateNode[]>();
  /** What is on each element. Weak, so removed elements can be collected. */
  private readonly contexts = new WeakMap<Element, ElementContext>();

  constructor(options: EngineOptions = {}) {
    this.document = options.document ?? globalThis.document;
    this.parser = options.parser ?? new BrowserTemplateParser(this.document);
    this.renderer = options.renderer ?? new DomRenderer(this.document);
  }

  /** Start the app: render the root component `type` into its host element in the page. */
  bootstrap<T>(type: Class<T>): View<T> {
    const metadata = this.componentMetadataOf(type);
    const host = this.document.querySelector(metadata.selector);
    if (!host) {
      throw new Error(`No host element matches "${metadata.selector}" for ${type.name}`);
    }
    return this.createComponent(type, host);
  }

  /**
   * Render component `type` into `host`. Without a host, a new (detached)
   * element is created from the component's selector: `tk-child` gives
   * `<tk-child>`, `[child]` gives `<div child>`, `tk-child[x]` gives `<tk-child x>`.
   */
  createComponent<T>(type: Class<T>, host?: Element): View<T> {
    const metadata = this.componentMetadataOf(type);
    host ??= this.createHost(metadata.selector, type);
    const context = this.contextOf(host);
    if (context.componentView) {
      throw new Error(`The host element of ${type.name} already holds a component`);
    }

    const instance = new type();
    const nodes = this.templateOf(type, metadata.template);
    const rendered = nodes.map((node) => this.build(node));
    for (const node of rendered) {
      this.renderer.appendChild(host, node);
    }

    const view = new View(host, instance, rendered, this.renderer);
    context.attachComponent(view);
    view.addDestroyCallback(() => {
      context.detachComponent();
      this.forgetIfEmpty(context);
    });
    return view;
  }

  /** Create a container that inserts views just before `anchor` (usually a comment). */
  createViewContainer(anchor: Node): ViewContainerRef {
    return new ViewContainerRef(anchor, this, this.renderer);
  }

  /** What is on `element` (its directives and component), or `undefined` if nothing. */
  getContext(element: Element): ElementContext | undefined {
    return this.contexts.get(element);
  }

  private componentMetadataOf(type: Class<unknown>) {
    const metadata = getComponentMetadata(type);
    if (!metadata) {
      throw new Error(`${type.name} is not a component: decorate it with @Component`);
    }
    return metadata;
  }

  /** Create a host element for a selector: an optional tag, then an optional `[attribute]`. */
  private createHost(selector: string, type: Class<unknown>): Element {
    const match = /^([a-z][a-z0-9-]*)?(?:\[([^\]=\s]+)\])?$/i.exec(selector);
    if (!match || (!match[1] && !match[2])) {
      throw new Error(`Cannot create a host element for ${type.name} from selector "${selector}"`);
    }
    const [, tag = "div", attribute] = match;
    const host = this.renderer.createElement(tag);
    if (attribute) {
      this.renderer.setAttribute(host, attribute, "");
    }
    return host;
  }

  /** The context of `element`, created (and remembered) if it has none yet. */
  private contextOf(element: Element): ElementContext {
    let context = this.contexts.get(element);
    if (!context) {
      context = new ElementContext(element);
      this.contexts.set(element, context);
    }
    return context;
  }

  /** Stop tracking a context once nothing is left on its element. */
  private forgetIfEmpty(context: ElementContext): void {
    if (context.isEmpty) {
      this.contexts.delete(context.element);
    }
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

// The template builder: turns a compiled template into DOM nodes for one
// component instance, and keeps the bindings it created along the way, so
// the view's watch can update them.
//
//   const template = templateBuilderFactory.create(component);
//   const nodes = template.build(compiledNodes);   // the DOM, bindings collected
//   watch(() => template.update(), scheduler);     // evaluate them, in template order
//
// One builder per view, created by the TemplateBuilderFactory (an app
// service, so builders get the app's services through DI). Today the
// bindings are the `{{ }}` texts; `[prop]` bindings and directive inputs
// will be collected and updated here too.

import { inject, Injectable, type Injector } from "../../../di/index.ts";
import { Maybe } from "../../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { type Binding, BindingFactory } from "../runtime/text-binding.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import type { CompiledElement, CompiledNode, CompiledText } from "../template/compile.ts";
import { outputsNamed } from "../authoring/output.ts";
import { Scope } from "../template/scope.ts";
import { evaluate } from "../template/evaluate.ts";
import { computed } from "../../../signals/index.ts";
import { RENDERER } from "../tokens.ts";
import { listenWithModifiers } from "../runtime/event-listener.ts";
import type { ComponentFactory } from "./component-factory.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import type { View } from "../runtime/view.ts";

/** Creates the TemplateBuilder of each view, with the app's services. */
@Injectable()
export class TemplateBuilderFactory {
  private readonly renderer = inject(RENDERER);
  private readonly bindingFactory = inject(BindingFactory);
  private readonly directiveFactory = inject(DirectiveFactory);

  /**
   * A builder for the template of `component`, creating the components in
   * its template with `components` (the ComponentFactory building `component`).
   */
  /**
   * A builder for `component`'s template. `scope` is what its expressions read
   * names from: by default the component alone, and for an embedded view the
   * component and the `@let`s above the block.
   */
  create(
    component: object,
    components: ComponentFactory,
    scope = new Scope(component),
  ): TemplateBuilder {
    return new TemplateBuilder(
      component,
      this.renderer,
      this.bindingFactory,
      this.directiveFactory,
      components,
      scope,
    );
  }
}

/** An element built with directives or a component, waiting for its view. */
interface ElementWithDirectives {
  readonly element: Element;
  readonly node: CompiledElement;
  /** A component's element: the content of its children, by slot name, for the component. */
  readonly projected: ReadonlyMap<string, Node[]>;
  /** The nearest enclosing element with directives (its index), if any. */
  readonly parent: Maybe<number>;
}

export class TemplateBuilder {
  /**
   * The bindings the view's watch updates: the template's (text and class
   * bindings, in template order), then the host bindings of its directives
   * and of the component.
   */
  private readonly bindings: Binding[] = [];
  /** The elements with directives, in template order (parents before children). */
  private readonly withDirectives: ElementWithDirectives[] = [];
  /** While building: the enclosing elements with directives (their indexes). */
  private readonly enclosing: number[] = [];
  /** The content this template's `<slot>`s show, by name; a slot takes its content once. */
  private projected = new Map<string, Node[]>();

  /**
   * @param component The instance whose fields the template's expressions read.
   * @param renderer Creates the DOM nodes.
   * @param bindingFactory Creates the bindings.
   * @param directiveFactory Creates the directives of the elements.
   * @param components Creates the components of the elements.
   */
  /** The names this template's expressions read: its component's fields and its `@let`s. */
  private readonly scope: Scope;

  constructor(
    private readonly component: object,
    private readonly renderer: Renderer,
    private readonly bindingFactory: BindingFactory,
    private readonly directiveFactory: DirectiveFactory,
    private readonly components: ComponentFactory,
    scope: Scope,
  ) {
    this.scope = scope;
  }

  /**
   * Build the DOM for `nodes` (and their children), collecting their bindings.
   * `projected` is the content of the component's element, by slot name, which
   * the template's `<slot>`s show.
   */
  build(
    nodes: readonly CompiledNode[],
    projected: ReadonlyMap<string, Node[]> = new Map(),
  ): Node[] {
    this.projected = new Map(projected);
    return this.buildAll(nodes);
  }

  private buildAll(nodes: readonly CompiledNode[]): Node[] {
    return nodes.flatMap((node) => this.buildNode(node));
  }

  /**
   * Create the directives and components of the elements built, once their
   * view exists: in template order (parents first). An element's directives
   * get its own injector, child of the enclosing element's (or of
   * `componentInjector`), so they can inject the directives of their element
   * and of its ancestors. Then the element's component, if any, is created
   * there, so it can inject them too; `view` owns it.
   */
  createDirectivesAndComponents(view: View, componentInjector: Injector): void {
    const injectors: Injector[] = [];
    for (const { element, node, parent, projected } of this.withDirectives) {
      const parentInjector = parent.match({
        some: (index) => injectors[index]!,
        none: () => componentInjector,
      });
      // Host bindings on this element (its directives', its component's) join
      // this view's watch, except for the classes this template binds on it:
      // the template's own binding takes precedence.
      const boundHere = new Set([
        ...node.classBindings.map(({ name }) => `class:${name}`),
        ...node.styleBindings.map(({ name }) => `style:${name}`),
        ...node.attributeBindings.map(({ name }) => `attr:${name}`),
      ]);
      const hostBindings = (bindings: readonly Binding[]) => this.addBindings(bindings
        .filter((binding) => binding.key === undefined || !boundHere.has(binding.key)));
      let injector = parentInjector;
      let directives: readonly object[] = [];
      if (node.directives.length > 0) {
        const created = this.directiveFactory
          .createOnElement(node.directives, element, view, parentInjector, node.attributes);
        injector = created.injector;
        directives = created.instances;
        hostBindings(created.bindings);
      }
      // Input bindings set the inputs of the element's directives and
      // component: their first values now (before the component's first
      // render), then this view's watch keeps them up to date.
      const bindInputs = (instances: readonly object[]) => {
        const binders = node.inputBindings.map(({ name, expression }) =>
          this.bindingFactory.inputs(name, expression, this.scope, instances, node.name));
        for (const binder of binders) {
          binder.update();
        }
        this.addBindings(binders);
      };
      let instances = directives;
      node.component.match({
        some: (type) => {
          const child = this.components.create(type, element, {
            parentInjector: injector,
            parentView: view,
            attributes: node.attributes,
            projected,
            adoptHostBindings: hostBindings,
            bindInputs: (component) => bindInputs([...directives, component]),
          });
          instances = [...directives, child.component];
        },
        none: () => bindInputs(directives),
      });
      // Event bindings: the outputs of the element's directives and component, and the DOM events.
      this.bindEvents(node, element, instances, view);
      injectors.push(injector);
    }
  }

  /**
   * Build the children of a component's element, grouped by their `slot`
   * attribute (the default slot, "", for the others), for the component to show.
   */
  private projectChildren(children: readonly CompiledNode[], groups: Map<string, Node[]>): void {
    for (const child of children) {
      const name = slotOf(child);
      groups.set(name, [...(groups.get(name) ?? []), ...this.buildNode(child)]);
    }
  }

  /**
   * Bind each `(name)` of `node` two ways, both calling the same handler with
   * the component (the template's owner) as `this`, for each value:
   * - the outputs `name` of `instances` (its directives and component), if any;
   * - the DOM event `name` on `element`, whatever is on it.
   * Both end with `view`.
   */
  private bindEvents(
    node: CompiledElement,
    element: Element,
    instances: readonly object[],
    view: View,
  ): void {
    for (const { name, method, passEvent, modifiers } of node.outputBindings) {
      const handler = this.handlerOf(name, method);
      const call = (value: unknown) => (passEvent
        ? handler.call(this.component, value)
        : handler.call(this.component));
      for (const emitter of outputsNamed(instances, name)) {
        view.addDestroyCallback(emitter.stream.run({ next: call }));
      }
      view.addDestroyCallback(
        listenWithModifiers(this.renderer, element, { event: name, modifiers }, call),
      );
    }
  }

  /** The method `method` of the component, for the event `name`. Throws if there is none. */
  private handlerOf(name: string, method: string): (...args: unknown[]) => unknown {
    const handler = (this.component as Record<string, unknown>)[method];
    if (typeof handler !== "function") {
      throw new Error(
        `${this.component.constructor.name} has no method "${method}" for event "(${name})"`,
      );
    }
    return handler as (...args: unknown[]) => unknown;
  }

  /** Add bindings for the view's watch to update too (e.g. host bindings). */
  addBindings(bindings: readonly Binding[]): void {
    this.bindings.push(...bindings);
  }

  /** Evaluate every binding, in template order, writing to the DOM what changed. */
  update(): void {
    for (const binding of this.bindings) {
      binding.update();
    }
  }

  /** A `<slot>` shows the content its name has, once; a text or an element is one node. */
  private buildNode(node: CompiledNode): Node[] {
    if (node.kind === "slot") {
      const nodes = this.projected.get(node.name) ?? [];
      this.projected.delete(node.name);
      return nodes;
    }
    if (node.kind === "match") {
      throw new Error("@if and @match are not rendered yet");
    }
    if (node.kind === "let") {
      // The value is a computed signal: it sees only the `@let`s declared above
      // it (a snapshot), and reading it makes the reader depend on what it reads.
      const above = new Scope(this.component, new Map(this.scope.lets));
      this.scope.lets.set(node.name, computed(() => evaluate(node.expression, above)));
      return [];
    }
    return [this.buildTextOrElement(node)];
  }

  /** A text with `{{ }}` starts empty and gets a binding, filled by `update`. */
  private buildTextOrElement(node: CompiledText | CompiledElement): Node {
    if (node.kind === "text") {
      const { strings, expressions } = node.interpolation;
      if (expressions.length === 0) {
        return this.renderer.createText(strings[0]!);
      }
      const text = this.renderer.createText("");
      this.bindings.push(this.bindingFactory.text(text, node.interpolation, this.scope));
      return text;
    }
    const element = this.renderer.createElement(node.name);
    for (const attribute of node.attributes) {
      this.renderer.setAttribute(element, attribute.name, attribute.value);
    }
    for (const { name, expression } of node.classBindings) {
      this.bindings.push(this.bindingFactory
        .classToggle(element, name, expression, this.scope));
    }
    for (const { name, expression } of node.styleBindings) {
      this.bindings.push(this.bindingFactory.style(element, name, expression, this.scope));
    }
    for (const { name, expression } of node.attributeBindings) {
      this.bindings.push(this.bindingFactory.attribute(element, name, expression, this.scope));
    }
    const projected = new Map<string, Node[]>();
    const index = this.recordDirectives(element, node, projected);
    if (node.component.isSome()) {
      this.projectChildren(node.children, projected);
    } else {
      for (const child of this.buildAll(node.children)) {
        this.renderer.appendChild(element, child);
      }
    }
    index.ifSome(() => this.enclosing.pop());
    return element;
  }

  /**
   * If `node` has directives, a component or event bindings, remember its
   * element (and enter it, for its children).
   */
  private recordDirectives(
    element: Element,
    node: CompiledElement,
    projected: Map<string, Node[]>,
  ): Maybe<number> {
    const hasEvents = node.outputBindings.length > 0;
    if (node.directives.length === 0 && node.component.isNone() && !hasEvents) {
      return Maybe.none();
    }
    const parent = Maybe.fromNullable(this.enclosing.at(-1));
    const index = this.withDirectives.push({ element, node, parent, projected }) - 1;
    this.enclosing.push(index);
    return Maybe.some(index);
  }
}

/** The slot a child of a component's element goes to: its `slot` attribute, or the default one. */
function slotOf(node: CompiledNode): string {
  if (node.kind !== "element") {
    return "";
  }
  return node.attributes.find((attribute) => attribute.name === "slot")?.value ?? "";
}

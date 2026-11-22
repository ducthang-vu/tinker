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

import type { ViewNode } from "../runtime/schedulers/view-scheduler.ts";
import { inject, Injectable, type Injector } from "../../../di/index.ts";
import { Maybe, partial } from "@tinker/functional";
import type { Renderer } from "../renderer.ts";
import { type Binding, BindingFactory } from "../runtime/text-binding.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import type {
  CompiledDeclaration,
  CompiledElement,
  DomFallback,
  TemplateReference,
  CompiledMap,
  CompiledMatch,
  CompiledNode,
  CompiledText,
} from "../template/compile.ts";
import { outputsNamed } from "../authoring/output.ts";
import { inputsNamed } from "../authoring/input.ts";
import { type Owned, ownerName } from "../runtime/owner.ts";
import { Scope } from "../template/scope.ts";
import { evaluate } from "../template/evaluate.ts";
import { requireMethod, runHandler } from "../template/handler.ts";
import { computed, type Signal, signal } from "../../../signals/index.ts";
import type { Class } from "../../../utils/types.ts";
import { RENDERER } from "../tokens.ts";
import { listenWithModifiers } from "../runtime/event-listener.ts";
import type { ComponentFactory } from "./component-factory.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import type { View } from "../runtime/view.ts";
import { MatchBinding } from "../runtime/match-binding.ts";
import { ClassMapBinding } from "../runtime/class-map-binding.ts";
import { ContainerPlacement, ElementPlacement, type Placement } from "../runtime/placement.ts";
import { MapBinding } from "../runtime/map-binding.ts";
import type { EmbeddedView } from "../runtime/embedded-view.ts";
import { EmbeddedViewFactory } from "./embedded-view-factory.ts";
import { TemplateRef } from "../runtime/template-ref.ts";
import { ContentQueries, type ViewQueries } from "../runtime/view-queries.ts";
import { type StyleScope, scopeOfComponent } from "../runtime/component-styles.ts";
import { match, map } from "@tinker/functional/v1";

/** Creates the TemplateBuilder of each view, with the app's services. */
@Injectable()
export class TemplateBuilderFactory {
  private readonly renderer = inject(RENDERER);
  private readonly bindingFactory = inject(BindingFactory);
  private readonly directiveFactory = inject(DirectiveFactory);
  private readonly embedded = inject(EmbeddedViewFactory);

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
    queries: ViewQueries,
    scope = new Scope(component),
    root = true,
    node: ViewNode = {},
  ): TemplateBuilder {
    return new TemplateBuilder(
      component,
      this.renderer,
      this.bindingFactory,
      this.directiveFactory,
      components,
      scope,
      this,
      this.embedded,
      queries,
      root,
      node,
    );
  }
}

/** An element built with directives or a component, waiting for its view. */
interface ElementWithDirectives {
  /** Where its directives sit: its element, or its container's anchor. */
  readonly placement: Placement;
  readonly node: CompiledElement;
  /** Its references to a directive or component: set once those exist. */
  readonly references: readonly PendingReference[];
  /** A component's element: the content of its children, by slot name, for the component. */
  readonly projected: ReadonlyMap<string, Node[]>;
  /** The nearest enclosing element with directives (its index), if any. */
  readonly parent: Maybe<number>;
  /** The content registry of the component this element is a direct child of, if any. */
  readonly sink?: ViewQueries;
  /** The content registry of this element's component, handed to the component. */
  readonly content?: ContentQueries;
}

/** A reference to a directive or to the component on an element, set when they are created. */
interface PendingReference {
  readonly name: string;
  readonly target: Exclude<TemplateReference["target"], { readonly kind: "element" }>;
  readonly value: Signal<unknown>;
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
  /** The matches built: their binding, and the index of their element (undefined: the root). */
  private readonly matches: {
    readonly binding: MatchBinding | MapBinding;
    readonly parent: number | undefined;
  }[] = [];

  /** The content this template's `<slot>`s show, by name; a slot takes its content once. */
  private projected = new Map<string, Node[]>();
  /** Set while a component's element children are built: the registry their elements go to. */
  private contentSink: ViewQueries | undefined;

  /**
   * @param component The instance whose fields the template's expressions read.
   * @param renderer Creates the DOM nodes.
   * @param bindingFactory Creates the bindings.
   * @param directiveFactory Creates the directives of the elements.
   * @param components Creates the components of the elements.
   */
  /** The names this template's expressions read: its component's fields and its `@let`s. */
  private readonly scope: Scope;
  /** Set when the component has styles: each element it creates gets its attribute. */
  private readonly styleScope: StyleScope | undefined;

  constructor(
    private readonly component: object,
    private readonly renderer: Renderer,
    private readonly bindingFactory: BindingFactory,
    private readonly directiveFactory: DirectiveFactory,
    private readonly components: ComponentFactory,
    scope: Scope,
    private readonly factory: TemplateBuilderFactory,
    private readonly embedded: EmbeddedViewFactory,
    private readonly queries: ViewQueries,
    /** Whether this is the component's own template, not an embedded view of it. */
    private readonly root: boolean,
    /** The view this builds, in the view tree: a block's views are owned by it. */
    readonly node: ViewNode,
  ) {
    this.scope = scope;
    this.styleScope = scopeOfComponent(component.constructor as Class<object>);
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
    this.attachMatches(undefined, view, componentInjector);
    for (const [index, entry] of this.withDirectives.entries()) {
      const { placement, node, parent, projected, references, sink, content } = entry;
      // A component is only on an element; the node the instances are view queries of.
      const element = placement.kind === "element" ? placement.element : undefined;
      const queried: Node = element ?? (placement as ContainerPlacement).anchor;
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
          .createOnPlacement(node.directives, placement, view, parentInjector, node.attributes);
        injector = created.injector;
        directives = created.instances;
        hostBindings(created.bindings);
      }
      // Input bindings set the inputs of the element's directives and
      // component: their first values now (before the component's first
      // render), then this view's watch keeps them up to date.
      const bindInputs = (owned: readonly Owned[]) => {
        const binders = node.inputBindings.map(({ name, owner, expression }) =>
          this.bindingFactory.inputs(
            name,
            expression,
            this.scope,
            reached(owned, "input", name, owner, node.name),
            node.name,
          ));
        for (const binder of binders) {
          binder.update();
        }
        this.addBindings(binders);
      };
      let instances = directives;
      let owner: { readonly type: Class<object>; readonly instance: object } | undefined;
      node.component.match({ some: (type) => {
        const child = this.components.create(type, element, {
          parentInjector: injector,
          parentView: view,
          node: this.node,
          attributes: node.attributes,
          projected,
          contentQueries: content,
          adoptHostBindings: hostBindings,
          bindInputs: (component) => bindInputs([
            ...this.ownedOf(node.directives, directives),
            ...this.ownedOf([type], [component]),
          ]),
        });
        instances = [...directives, child.component];
        owner = { type, instance: child.component };
      }, none: () => bindInputs(this.ownedOf(node.directives, directives)) });
      this.resolveReferences(
        node,
        references,
        [
          ...node.directives.map((type, i) => ({ type, instance: directives[i]! })),
          ...(owner ? [owner] : []),
        ],
        owner?.instance,
      );
      // Event bindings: the outputs of the element's directives and component, and the DOM events.
      if (element !== undefined) {
        this.bindEvents(node, element, [
          ...this.ownedOf(node.directives, directives),
          ...(owner === undefined ? [] : this.ownedOf([owner.type], [owner.instance])),
        ], view);
      }
      // The instances are view queries of this component, and of the component they
      // are projected into: removed with their view.
      for (const instance of instances) {
        view.addDestroyCallback(this.queries.add(instance, queried));
        if (sink !== undefined) {
          view.addDestroyCallback(sink.add(instance, queried));
        }
      }
      injectors.push(injector);
      this.attachMatches(index, view, injector);
    }
  }

  /**
   * The references an element declares: `#name` is the element, set now; the others
   * are returned, to be set once the directives and component on the element exist.
   */
  private declareReferences(node: CompiledElement, element: Node): PendingReference[] {
    const pending: PendingReference[] = [];
    for (const { name, target } of node.references) {
      if (this.scope.lets.has(name)) {
        throw new Error(`#${name} is already declared in this template`);
      }
      // A top-level name is also in the component's registry, so a query can name it.
      const value = this.root ? this.queries.reference(name) : signal<unknown>(undefined);
      this.scope.lets.set(name, value);
      if (target.kind === "element") {
        value.set(element);
      } else {
        pending.push({ name, target, value });
      }
    }
    return pending;
  }

  /**
   * Set the references to directives and components on an element, once those are
   * created: `#name="exportAs"` is the one with that exportAs, `##name` the component.
   */
  private resolveReferences(
    node: CompiledElement,
    references: readonly PendingReference[],
    directives: readonly { readonly type: Class<object>; readonly instance: object }[],
    component: object | undefined,
  ): void {
    for (const { name, target, value } of references) {
      if (target.kind === "component") {
        if (component === undefined) {
          throw new Error(`##${name}: <${node.name}> has no component`);
        }
        value.set(component);
        continue;
      }
      const match = directives.find(({ type }) =>
        this.directiveFactory.metadataOf(type).exportAs === target.exportAs);
      if (match === undefined) {
        throw new Error(
          `#${name}="${target.exportAs}": no directive on <${node.name}> is exported as "${target.exportAs}"`,
        );
      }
      value.set(match.instance);
    }
  }

  /**
   * Build the children of a component's element, grouped by their `slot`
   * attribute (the default slot, "", for the others), for the component to show.
   */
  private projectChildren(
    children: readonly CompiledNode[],
    groups: Map<string, Node[]>,
    content: ContentQueries,
  ): void {
    for (const child of children) {
      const name = slotOf(child);
      // A direct element child is content of the component: its directives are recorded there.
      this.contentSink = child.kind === "element" ? content : undefined;
      groups.set(name, [...(groups.get(name) ?? []), ...this.buildNode(child)]);
    }
    this.contentSink = undefined;
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
    owned: readonly Owned[],
    view: View,
  ): void {
    for (const { name, owner, handler, modifiers, domFallback } of node.outputBindings) {
      if (handler.target === undefined) {
        requireMethod(this.component, handler.method, `event "(${name})"`);
      }
      const call = (value: unknown) => runHandler(handler, this.scope, value);
      // `(owner.enter)` with a fallback is the output when `owner` has one, else the DOM event.
      const hasOutput = (item: Owned) =>
        item.owner === owner && outputsNamed([item.instance], name).length > 0;
      const qualified = domFallback === undefined || owned.some(hasOutput);
      if (qualified) {
        const emitters = outputsNamed(reached(owned, "output", name, owner, node.name), name);
        for (const emitter of emitters) {
          view.addDestroyCallback(emitter.stream.run({ next: call }));
        }
      }
      // A qualified output is the directive's alone: the DOM event of that name is not bound.
      let dom: DomFallback | undefined;
      if (owner === undefined) {
        dom = { event: name, modifiers };
      } else if (!qualified) {
        dom = domFallback;
      }
      if (dom !== undefined) {
        view.addDestroyCallback(listenWithModifiers(this.renderer, element, dom, call));
      }
    }
  }

  /** The directives (or the component) with the owner names their selectors give them. */
  private ownedOf(types: readonly Class<object>[], instances: readonly object[]): Owned[] {
    return types.map((type, index) => ({
      owner: ownerName(this.directiveFactory.metadataOf(type).selector),
      instance: instances[index]!,
    }));
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
    const sink = this.contentSink;
    this.contentSink = undefined;
    if (node.kind === "slot") {
      const nodes = this.projected.get(node.name) ?? [];
      this.projected.delete(node.name);
      return nodes;
    }
    if (node.kind === "match") {
      return [this.buildMatch(node)];
    }
    if (node.kind === "map") {
      return [this.buildMap(node)];
    }
    if (node.kind === "declaration") {
      this.declareTemplate(node);
      return [];
    }
    if (node.kind === "let") {
      // The value is a computed signal: it sees only the `@let`s declared above
      // it (a snapshot), and reading it makes the reader depend on what it reads.
      const above = new Scope(this.component, new Map(this.scope.lets));
      this.scope.lets.set(node.name, computed(partial(evaluate, node.expression, above)));
      return [];
    }
    if (node.kind === "element" && node.container) {
      return this.buildContainer(node);
    }
    return [this.buildTextOrElement(node, sink)];
  }

  /**
   * A match leaves a comment anchor, where its shown branch goes. Its binding
   * is attached once the element it is in has its injector.
   */
  private buildMatch(node: CompiledMatch): Node {
    const anchor = this.renderer.createComment("");
    const binding = new MatchBinding(
      node,
      this.scope,
      new Map(this.scope.lets),
      (body, scope, injector) => this.renderBranch(body, scope, anchor, injector),
    );
    this.bindings.push(binding);
    this.matches.push({ binding, parent: this.enclosing.at(-1) });
    return anchor;
  }

  /** A template declared here: a value under its name, rendering nothing in place. */
  private declareTemplate(node: CompiledDeclaration): void {
    if (this.scope.lets.has(node.name)) {
      throw new Error(`#${node.name} is already declared in this template`);
    }
    const template = new TemplateRef(
      node.body,
      node.names,
      this.scope,
      (body, scope, anchor, injector) => this.renderBranch(body, scope, anchor, injector),
    );
    this.scope.lets.set(node.name, signal(template));
  }

  /**
   * A map leaves a comment anchor, after which its rows are placed. Its binding
   * is attached like a match's, once its element has its injector.
   */
  private buildMap(node: CompiledMap): Node {
    const anchor = this.renderer.createComment("");
    const binding = new MapBinding(
      node,
      this.scope,
      new Map(this.scope.lets),
      anchor,
      this.renderer,
      (body, scope, rowAnchor, injector) => this.renderBranch(body, scope, rowAnchor, injector),
      this.queries,
    );
    this.bindings.push(binding);
    this.matches.push({ binding, parent: this.enclosing.at(-1) });
    return anchor;
  }

  /** A branch: a template of the component, with the scope given, after `anchor`. */
  private renderBranch(
    body: readonly CompiledNode[],
    scope: Scope,
    anchor: Node,
    injector: Injector,
  ): EmbeddedView {
    const builder = this.factory.create(
      this.component,
      this.components,
      this.queries,
      scope,
      false,
      { owner: this.node },
    );
    return this.embedded.create(builder, body, anchor, injector);
  }

  /** Attach the matches in `parent` (undefined: the template's root), with `injector`. */
  private attachMatches(parent: number | undefined, view: View, injector: Injector): void {
    for (const match of this.matches) {
      if (match.parent === parent) {
        match.binding.attach(view, injector);
      }
    }
  }

  /** A text with `{{ }}` starts empty and gets a binding, filled by `update`. */
  private buildTextOrElement(node: CompiledText | CompiledElement, sink?: ViewQueries): Node {
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
    if (this.styleScope !== undefined) {
      this.renderer.setAttribute(element, this.styleScope.attribute, "");
    }
    for (const attribute of node.attributes) {
      this.renderer.setAttribute(element, attribute.name, attribute.value);
    }
    const pending = this.declareReferences(node, element);
    for (const { name, expression } of node.classBindings) {
      this.bindings.push(this.bindingFactory
        .classToggle(element, name, expression, this.scope));
    }
    for (const { expression } of node.classObjects) {
      this.bindings.push(new ClassMapBinding(element, expression, this.scope, this.renderer));
    }
    for (const { name, expression } of node.styleBindings) {
      this.bindings.push(this.bindingFactory.style(element, name, expression, this.scope));
    }
    for (const { name, expression } of node.attributeBindings) {
      this.bindings.push(this.bindingFactory.attribute(element, name, expression, this.scope));
    }
    const projected = new Map<string, Node[]>();
    const content = node.component.isSome() ? new ContentQueries() : undefined;
    const index = this.recordDirectives(new ElementPlacement(element), node, projected, pending, {
      sink,
      content,
    });
    if (content !== undefined) {
      this.projectChildren(node.children, projected, content);
    } else {
      for (const child of this.buildAll(node.children)) {
        this.renderer.appendChild(element, child);
      }
    }
    index.ifSome(() => this.enclosing.pop());
    return element;
  }

  /**
   * A `<tk-container>`: its own content, then its anchor, so the instances its
   * directives render go after that content. Its directives are created with the others.
   */
  private buildContainer(node: CompiledElement): Node[] {
    const anchor = this.renderer.createComment("");
    const pending = this.declareReferences(node, anchor);
    const index = this.recordDirectives(
      new ContainerPlacement(anchor),
      node,
      new Map(),
      pending,
      {},
    );
    const children = this.buildAll(node.children);
    index.ifSome(() => this.enclosing.pop());
    return [...children, anchor];
  }

  /**
   * If `node` has directives, a component or event bindings, remember its
   * element (and enter it, for its children).
   */
  private recordDirectives(
    placement: Placement,
    node: CompiledElement,
    projected: Map<string, Node[]>,
    references: readonly PendingReference[],
    links: { readonly sink?: ViewQueries; readonly content?: ContentQueries },
  ): Maybe<number> {
    const hasEvents = node.outputBindings.length > 0;
    if (node.directives.length === 0 && node.component.isNone() && !hasEvents
      && references.length === 0) {
      return Maybe.none();
    }
    const parent = Maybe.from(this.enclosing.at(-1));
    const index = this.withDirectives.push({
      placement,
      node,
      parent,
      projected,
      references,
      ...links,
    }) - 1;
    this.enclosing.push(index);
    return Maybe.some(index);
  }
}

/**
 * The instances a binding reaches on an element: those of the owner it names, or, for an
 * unqualified binding, those with the input (or output) of that name. An unqualified
 * binding that would reach two instances is an error: it must name its owner.
 */
function reached(
  owned: readonly Owned[],
  kind: "input" | "output",
  name: string,
  owner: string | undefined,
  elementName: string,
): object[] {
  const [open, close] = kind === "input" ? ["[", "]"] : ["(", ")"];
  const written = (qualified: string) => `${open}${qualified}${close}`;
  const candidates = owner === undefined ? owned : owned.filter((item) => item.owner === owner);
  if (owner !== undefined && candidates.length === 0) {
    const hint = kind === "output" ? ", or a DOM modifier such as .prevent" : "";
    throw new Error(`${written(`${owner}.${name}`)} on <${elementName}>: no directive or component has the selector "${owner}"${hint}`);
  }
  const has = (instance: object) => kind === "input"
    ? inputsNamed([instance], name).length > 0
    : outputsNamed([instance], name).length > 0;
  const reaching = candidates.filter((item) => has(item.instance));
  if (owner !== undefined && reaching.length === 0) {
    throw new Error(`${written(`${owner}.${name}`)} on <${elementName}>: "${owner}" has no ${kind} "${name}"`);
  }
  if (owner === undefined && reaching.length > 1) {
    const owners = reaching.map((item) => item.owner);
    throw new Error(
      `${written(name)} on <${elementName}> would reach ${owners.join(" and ")}: `
      + `write ${written(`${owners[0]}.${name}`)} to choose one`,
    );
  }
  return reaching.map((item) => item.instance);
}

/** The slot a child of a component's element goes to: its `slot` attribute, or the default one. */
function slotOf(node: CompiledNode): string {
  if (node.kind !== "element") {
    return "";
  }
  return node.attributes.find((attribute) => attribute.name === "slot")?.value ?? "";
}

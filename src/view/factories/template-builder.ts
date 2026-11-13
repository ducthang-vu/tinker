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

import { inject, Injectable, type Injector } from "../../di/index.ts";
import { Maybe } from "../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { type Binding, BindingFactory } from "../runtime/text-binding.ts";
import type { View } from "../runtime/view.ts";
import type { CompiledElement, CompiledNode } from "../template/compile.ts";
import { RENDERER } from "../tokens.ts";
import type { ComponentFactory } from "./component-factory.ts";
import { DirectiveFactory } from "./directive-factory.ts";

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
  create(component: object, components: ComponentFactory): TemplateBuilder {
    return new TemplateBuilder(
      component,
      this.renderer,
      this.bindingFactory,
      this.directiveFactory,
      components,
    );
  }
}

/** An element built with directives or a component, waiting for its view. */
interface ElementWithDirectives {
  readonly element: Element;
  readonly node: CompiledElement;
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

  /**
   * @param component The instance whose fields the template's expressions read.
   * @param renderer Creates the DOM nodes.
   * @param bindingFactory Creates the bindings.
   * @param directiveFactory Creates the directives of the elements.
   * @param components Creates the components of the elements.
   */
  constructor(
    private readonly component: object,
    private readonly renderer: Renderer,
    private readonly bindingFactory: BindingFactory,
    private readonly directiveFactory: DirectiveFactory,
    private readonly components: ComponentFactory,
  ) {}

  /** Build the DOM for `nodes` (and their children), collecting their bindings. */
  build(nodes: readonly CompiledNode[]): Node[] {
    return nodes.map((node) => this.buildNode(node));
  }

  /**
   * Create the directives and components of the elements built, once their
   * view exists: in template order (parents first). An element's directives
   * get its own injector, child of the enclosing element's (or of
   * `componentInjector`), so they can inject the directives of their element
   * and of its ancestors. Then the element's component, if any, is created
   * there, so it can inject them too; `view` owns it.
   */
  createDirectivesAndComponents(view: View<unknown>, componentInjector: Injector): void {
    const injectors: Injector[] = [];
    for (const { element, node, parent } of this.withDirectives) {
      const parentInjector = parent.match({
        some: (index) => injectors[index]!,
        none: () => componentInjector,
      });
      let injector = parentInjector;
      if (node.directives.length > 0) {
        const created = this.directiveFactory
          .createOnElement(node.directives, element, view, parentInjector, node.attributes);
        injector = created.injector;
        this.addBindings(created.bindings);
      }
      node.component.ifSome((type) => {
        this.components.create(type, element, {
          parentInjector: injector,
          parentView: view,
          attributes: node.attributes,
        });
      });
      injectors.push(injector);
    }
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

  /** A text with `{{ }}` starts empty and gets a binding, filled by `update`. */
  private buildNode(node: CompiledNode): Node {
    if (node.kind === "text") {
      const { strings, expressions } = node.interpolation;
      if (expressions.length === 0) {
        return this.renderer.createText(strings[0]!);
      }
      const text = this.renderer.createText("");
      this.bindings.push(this.bindingFactory.text(text, node.interpolation, this.component));
      return text;
    }
    const element = this.renderer.createElement(node.name);
    for (const attribute of node.attributes) {
      this.renderer.setAttribute(element, attribute.name, attribute.value);
    }
    for (const { name, expression } of node.classBindings) {
      this.bindings.push(this.bindingFactory
        .classToggle(element, name, expression, this.component));
    }
    const index = this.recordDirectives(element, node);
    for (const child of this.build(node.children)) {
      this.renderer.appendChild(element, child);
    }
    index.ifSome(() => this.enclosing.pop());
    return element;
  }

  /**
   * If `node` has directives or a component, remember its element (and
   * enter it, for its children).
   */
  private recordDirectives(element: Element, node: CompiledElement): Maybe<number> {
    if (node.directives.length === 0 && node.component.isNone()) {
      return Maybe.none();
    }
    const parent = Maybe.fromNullable(this.enclosing.at(-1));
    const index = this.withDirectives.push({ element, node, parent }) - 1;
    this.enclosing.push(index);
    return Maybe.some(index);
  }
}

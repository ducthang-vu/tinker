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
import { BindingFactory, type TextBinding } from "../runtime/text-binding.ts";
import type { View } from "../runtime/view.ts";
import type { CompiledElement, CompiledNode } from "../template/compile.ts";
import { RENDERER } from "../tokens.ts";
import { DirectiveFactory } from "./directive-factory.ts";

/** Creates the TemplateBuilder of each view, with the app's services. */
@Injectable()
export class TemplateBuilderFactory {
  private readonly renderer = inject(RENDERER);
  private readonly bindingFactory = inject(BindingFactory);
  private readonly directiveFactory = inject(DirectiveFactory);

  /** A builder for the template of `component`. */
  create(component: object): TemplateBuilder {
    return new TemplateBuilder(
      component,
      this.renderer,
      this.bindingFactory,
      this.directiveFactory,
    );
  }
}

/** An element built with directives, waiting for `createDirectives`. */
interface ElementWithDirectives {
  readonly element: Element;
  readonly node: CompiledElement;
  /** The nearest enclosing element with directives (its index), if any. */
  readonly parent: Maybe<number>;
}

export class TemplateBuilder {
  /** The bindings created by `build`, in template order. */
  private readonly bindings: TextBinding[] = [];
  /** The elements with directives, in template order (parents before children). */
  private readonly withDirectives: ElementWithDirectives[] = [];
  /** While building: the enclosing elements with directives (their indexes). */
  private readonly enclosing: number[] = [];

  /**
   * @param component The instance whose fields the template's expressions read.
   * @param renderer Creates the DOM nodes.
   * @param bindingFactory Creates the bindings.
   * @param directiveFactory Creates the directives of the elements.
   */
  constructor(
    private readonly component: object,
    private readonly renderer: Renderer,
    private readonly bindingFactory: BindingFactory,
    private readonly directiveFactory: DirectiveFactory,
  ) {}

  /** Build the DOM for `nodes` (and their children), collecting their bindings. */
  build(nodes: readonly CompiledNode[]): Node[] {
    return nodes.map((node) => this.buildNode(node));
  }

  /**
   * Create the directives of the elements built, once their view exists: in
   * template order, each element in its own injector, child of the
   * enclosing element's (or of `componentInjector`), so a directive can
   * inject the directives of its element and of its ancestors.
   */
  createDirectives(view: View<unknown>, componentInjector: Injector): void {
    const injectors: Injector[] = [];
    for (const { element, node, parent } of this.withDirectives) {
      const parentInjector = parent.match({
        some: (index) => injectors[index]!,
        none: () => componentInjector,
      });
      const { injector } = this.directiveFactory
        .createOnElement(node.directives, element, view, parentInjector, node.attributes);
      injectors.push(injector);
    }
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
      if (/^[[(]/.test(attribute.name)) {
        throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
      }
      this.renderer.setAttribute(element, attribute.name, attribute.value);
    }
    const index = this.recordDirectives(element, node);
    for (const child of this.build(node.children)) {
      this.renderer.appendChild(element, child);
    }
    index.ifSome(() => this.enclosing.pop());
    return element;
  }

  /** If `node` has directives, remember its element (and enter it, for its children). */
  private recordDirectives(element: Element, node: CompiledElement): Maybe<number> {
    if (node.directives.length === 0) {
      return Maybe.none();
    }
    const parent = Maybe.fromNullable(this.enclosing.at(-1));
    const index = this.withDirectives.push({ element, node, parent }) - 1;
    this.enclosing.push(index);
    return Maybe.some(index);
  }
}

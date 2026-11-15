// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation, and each element lists the directives whose selector it
// matches (among those the component imports). Done once per component
// class; errors are reported here, before anything is rendered.
//
// Attributes are classified here too: plain ones, class bindings
// (`[class.done]="todo.done()"`) and input bindings (`[label]="name()"`,
// which set an input of the directives or component on the element), their
// expressions parsed. Other binding syntax (`[style.x]`, `[attr.x]`,
// `(event)`) is reported as not supported yet.

import type { AttributeNode, ElementNode, TemplateNode } from "./ast.ts";
import { type Expression, ExpressionParser } from "./expression.ts";
import { parseHandler } from "./handler.ts";
import { Maybe } from "../../functional/index.ts";
import type { Class } from "../../utils/types.ts";
import { type Interpolation, parseInterpolation } from "./interpolation.ts";
import type { Selector } from "./selector.ts";

/** A node of a compiled template. */
export type CompiledNode = CompiledElement | CompiledText;

export interface CompiledElement {
  readonly kind: "element";
  readonly name: string;
  /** Its plain attributes (not its bindings). */
  readonly attributes: readonly AttributeNode[];
  /** Its class bindings, e.g. `[class.done]="todo.done()"`, in template order. */
  readonly classBindings: readonly ClassBindingNode[];
  /** Its style bindings, e.g. `[style.color]="item().color"`, in template order. */
  readonly styleBindings: readonly ValueBindingNode[];
  /** Its attribute bindings, e.g. `[attr.title]="item().label"`, in template order. */
  readonly attributeBindings: readonly ValueBindingNode[];
  /** Its input bindings, e.g. `[label]="item().name"`, in template order. */
  readonly inputBindings: readonly InputBindingNode[];
  /** Its output bindings, e.g. `(selected)="choose($event)"`, in template order. */
  readonly outputBindings: readonly OutputBindingNode[];
  readonly children: readonly CompiledNode[];
  /** The directives matching this element (not its component), in import order. */
  readonly directives: readonly Class<object>[];
  /** The component matching this element, if any: the element is its host. */
  readonly component: Maybe<Class<object>>;
}

/** A style or attribute binding: `name` gets the value of `expression`. */
export interface ValueBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/** A class binding: class `name`, on while `expression` is truthy. */
export interface ClassBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/**
 * An input binding: the inputs `name` of the element's directives and
 * component get the value of `expression`.
 */
export interface InputBindingNode {
  readonly name: string;
  readonly expression: Expression;
}

/**
 * An event binding: the handler runs for each value of the outputs `name` of
 * the element's directives and component, and for each DOM event `name` on the
 * element (both, when both exist).
 */
export interface OutputBindingNode {
  readonly name: string;
  readonly method: string;
  /** Whether the handler receives the value (`$event`) or nothing. */
  readonly passEvent: boolean;
}

/** A directive the template may use, and where it applies. */
export interface DirectiveCandidate {
  readonly type: Class<object>;
  readonly selector: Selector;
  /** A component: an element matches at most one, and becomes its host. */
  readonly isComponent: boolean;
}

/** Text, as static strings and the expressions between them. */
export interface CompiledText {
  readonly kind: "text";
  readonly interpolation: Interpolation;
}

/**
 * Compile parsed nodes, matching their elements against `candidates`.
 * Throws for the first invalid `{{ }}`, an element matching two components,
 * or content inside a component's element (projection is not supported yet).
 */
export function compileTemplate(
  nodes: readonly TemplateNode[],
  candidates: readonly DirectiveCandidate[] = [],
): readonly CompiledNode[] {
  return nodes.map((node) => compileNode(node, candidates));
}

function compileNode(node: TemplateNode, candidates: readonly DirectiveCandidate[]): CompiledNode {
  if (node.kind === "text") {
    return { kind: "text", interpolation: parseInterpolation(node.value)
      .getOrThrow() };
  }
  const {
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
  } = classifyAttributes(node);
  const matched = candidates.filter((candidate) =>
    candidate.selector.matches({ name: node.name, attributes }));
  const components = matched.filter(({ isComponent }) => isComponent);
  if (components.length > 1) {
    const names = components.map(({ type }) => type.name)
      .join(", ");
    throw new Error(`<${node.name}> matches several components: ${names}`);
  }
  const component = Maybe.fromNullable(components[0]?.type);
  component.ifSome((type) => {
    if (node.children.some((child) => child.kind === "element" || child.value.trim() !== "")) {
      throw new Error(
        `Content inside <${node.name}> is not supported yet: ${type.name} renders its own template`,
      );
    }
  });
  const directives = matched.filter(({ isComponent }) => !isComponent)
    .map(({ type }) => type);
  if (inputBindings.length > 0 && directives.length === 0 && component.isNone()) {
    throw new Error(
      `[${inputBindings[0]!.name}] on <${node.name}>: only inputs can be bound, `
      + "and no imported directive or component matches this element",
    );
  }
  return {
    kind: "element",
    name: node.name,
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
    // A component's element has no content of its own: the component renders into it.
    children: component.isSome() ? [] : compileTemplate(node.children, candidates),
    directives,
    component,
  };
}

const CLASS_BINDING = /^\[class\.([^\]\s]+)\]$/;
const INPUT_BINDING = /^\[([^\].\s]+)\]$/;
const OUTPUT_BINDING = /^\(([^).\s]+)\)$/;
const STYLE_BINDING = /^\[style\.([^\]\s]+)\]$/;
const ATTRIBUTE_BINDING = /^\[attr\.([^\]\s]+)\]$/;

/**
 * Split the attributes of `node` into plain attributes, class bindings and
 * input bindings (parsing their expressions). Throws for other binding
 * syntax, or an invalid expression.
 */
function classifyAttributes(node: ElementNode): {
  attributes: AttributeNode[];
  classBindings: ClassBindingNode[];
  inputBindings: InputBindingNode[];
  outputBindings: OutputBindingNode[];
  styleBindings: ValueBindingNode[];
  attributeBindings: ValueBindingNode[];
} {
  const attributes: AttributeNode[] = [];
  const classBindings: ClassBindingNode[] = [];
  const inputBindings: InputBindingNode[] = [];
  const outputBindings: OutputBindingNode[] = [];
  const styleBindings: ValueBindingNode[] = [];
  const attributeBindings: ValueBindingNode[] = [];
  const parse = (attribute: AttributeNode) => ExpressionParser.parse(attribute.value)
    .mapLeft((error) => new Error(`${error.message}, in ${attribute.name} on <${node.name}>`))
    .getOrThrow();
  for (const attribute of node.attributes) {
    const className = CLASS_BINDING.exec(attribute.name)?.[1];
    const inputName = INPUT_BINDING.exec(attribute.name)?.[1];
    const outputName = OUTPUT_BINDING.exec(attribute.name)?.[1];
    const styleName = STYLE_BINDING.exec(attribute.name)?.[1];
    const attrName = ATTRIBUTE_BINDING.exec(attribute.name)?.[1];
    if (styleName !== undefined) {
      styleBindings.push({ name: styleName, expression: parse(attribute) });
    } else if (attrName !== undefined) {
      attributeBindings.push({ name: attrName, expression: parse(attribute) });
    } else if (className !== undefined) {
      classBindings.push({ name: className, expression: parse(attribute) });
    } else if (inputName !== undefined) {
      inputBindings.push({ name: inputName, expression: parse(attribute) });
    } else if (outputName !== undefined) {
      const handler = parseHandler(attribute.value, "event handler")
        .mapLeft((error) =>
          new Error(`${error.message}, on <${node.name}>`))
        .getOrThrow();
      outputBindings.push({ name: outputName, ...handler });
    } else if (/^[[(]/.test(attribute.name)) {
      throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
    } else {
      attributes.push(attribute);
    }
  }
  return {
    attributes,
    classBindings,
    inputBindings,
    outputBindings,
    styleBindings,
    attributeBindings,
  };
}

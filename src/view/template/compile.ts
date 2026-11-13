// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation, and each element lists the directives whose selector it
// matches (among those the component imports). Done once per component
// class; errors are reported here, before anything is rendered.
//
// Attributes are classified here too: plain ones, and class bindings
// (`[class.done]="todo.done()"`, their expression parsed). Other binding
// syntax (`[prop]`, `(event)`) is reported as not supported yet.

import type { AttributeNode, ElementNode, TemplateNode } from "./ast.ts";
import { type Expression, ExpressionParser } from "./expression.ts";
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
  readonly children: readonly CompiledNode[];
  /** The directives matching this element (not its component), in import order. */
  readonly directives: readonly Class<object>[];
  /** The component matching this element, if any: the element is its host. */
  readonly component: Maybe<Class<object>>;
}

/** A class binding: class `name`, on while `expression` is truthy. */
export interface ClassBindingNode {
  readonly name: string;
  readonly expression: Expression;
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
  const { attributes, classBindings } = classifyAttributes(node);
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
  return {
    kind: "element",
    name: node.name,
    attributes,
    classBindings,
    // A component's element has no content of its own: the component renders into it.
    children: component.isSome() ? [] : compileTemplate(node.children, candidates),
    directives: matched.filter(({ isComponent }) => !isComponent)
      .map(({ type }) => type),
    component,
  };
}

const CLASS_BINDING = /^\[class\.([^\]\s]+)\]$/;

/**
 * Split the attributes of `node` into plain attributes and class bindings
 * (parsing their expressions). Throws for other binding syntax, or an
 * invalid expression.
 */
function classifyAttributes(node: ElementNode): {
  attributes: AttributeNode[];
  classBindings: ClassBindingNode[];
} {
  const attributes: AttributeNode[] = [];
  const classBindings: ClassBindingNode[] = [];
  for (const attribute of node.attributes) {
    const className = CLASS_BINDING.exec(attribute.name)?.[1];
    if (className !== undefined) {
      const expression = ExpressionParser.parse(attribute.value)
        .mapLeft((error) => new Error(`${error.message}, in ${attribute.name} on <${node.name}>`))
        .getOrThrow();
      classBindings.push({ name: className, expression });
    } else if (/^[[(]/.test(attribute.name)) {
      throw new Error(`Bindings are not supported yet: "${attribute.name}" on <${node.name}>`);
    } else {
      attributes.push(attribute);
    }
  }
  return { attributes, classBindings };
}

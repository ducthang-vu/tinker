// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation, and each element lists the directives whose selector it
// matches (among those the component imports). Done once per component
// class; errors are reported here, before anything is rendered.
//
// Later: attributes are classified here too (static, `[prop]`, `(event)`).

import type { AttributeNode, TemplateNode } from "./ast.ts";
import { Maybe } from "../../functional/index.ts";
import type { Class } from "../../utils/types.ts";
import { type Interpolation, parseInterpolation } from "./interpolation.ts";
import type { Selector } from "./selector.ts";

/** A node of a compiled template. */
export type CompiledNode = CompiledElement | CompiledText;

export interface CompiledElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly CompiledNode[];
  /** The directives matching this element (not its component), in import order. */
  readonly directives: readonly Class<object>[];
  /** The component matching this element, if any: the element is its host. */
  readonly component: Maybe<Class<object>>;
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
  const matched = candidates.filter((candidate) => candidate.selector.matches(node));
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
    ...node,
    // A component's element has no content of its own: the component renders into it.
    children: component.isSome() ? [] : compileTemplate(node.children, candidates),
    directives: matched.filter(({ isComponent }) => !isComponent)
      .map(({ type }) => type),
    component,
  };
}

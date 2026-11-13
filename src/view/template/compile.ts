// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation, and each element lists the directives whose selector it
// matches (among those the component imports). Done once per component
// class; errors are reported here, before anything is rendered.
//
// Later: attributes are classified here too (static, `[prop]`, `(event)`).

import type { AttributeNode, TemplateNode } from "./ast.ts";
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
  /** The directives matching this element, in the order they were imported. */
  readonly directives: readonly Class<object>[];
}

/** A directive the template may use, and where it applies. */
export interface DirectiveCandidate {
  readonly type: Class<object>;
  readonly selector: Selector;
  /** Components in templates are not supported yet: matching one throws. */
  readonly isComponent: boolean;
}

/** Text, as static strings and the expressions between them. */
export interface CompiledText {
  readonly kind: "text";
  readonly interpolation: Interpolation;
}

/**
 * Compile parsed nodes, matching their elements against `candidates`.
 * Throws for the first invalid `{{ }}`, or an element matching a component.
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
  for (const { type, isComponent } of matched) {
    if (isComponent) {
      throw new Error(
        `Components in templates are not supported yet: <${node.name}> matches ${type.name}`,
      );
    }
  }
  return {
    ...node,
    children: compileTemplate(node.children, candidates),
    directives: matched.map(({ type }) => type),
  };
}

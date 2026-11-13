// Compiling a template: the step after parsing, shared by all parsers (see
// ast.ts). It turns the raw tree into one the factory builds from directly,
// with the Tinker syntax already parsed: each text's `{{ }}` becomes an
// Interpolation. Done once per component class; errors are reported here,
// before anything is rendered.
//
// Later: attributes are classified here too (static, `[prop]`, `(event)`).

import type { AttributeNode, TemplateNode } from "./ast.ts";
import { type Interpolation, parseInterpolation } from "./interpolation.ts";

/** A node of a compiled template. */
export type CompiledNode = CompiledElement | CompiledText;

export interface CompiledElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly CompiledNode[];
}

/** Text, as static strings and the expressions between them. */
export interface CompiledText {
  readonly kind: "text";
  readonly interpolation: Interpolation;
}

/** Compile parsed nodes. Throws for the first invalid `{{ }}`. */
export function compileTemplate(nodes: readonly TemplateNode[]): readonly CompiledNode[] {
  return nodes.map(compileNode);
}

function compileNode(node: TemplateNode): CompiledNode {
  if (node.kind === "text") {
    return { kind: "text", interpolation: parseInterpolation(node.value).getOrThrow() };
  }
  return { ...node, children: compileTemplate(node.children) };
}

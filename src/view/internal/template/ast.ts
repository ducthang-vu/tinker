// The template syntax tree: what a parser produces, and what the engine reads.
//
// It is Tinker's own format, independent of how the template was parsed.
// Parsers are deliberately dumb: attribute names and values are kept raw
// (e.g. `[disabled]`, `(click)`), and text keeps its `{{ }}` as written.
// Deciding what is a binding happens in a later step, shared by all parsers:
// interpolation.ts splits text around `{{ }}`, and expression.ts parses
// the expressions.

/** A node in a parsed template. */
export type TemplateNode = ElementNode | TextNode;

/** An element, e.g. `<button (click)="inc()">`. */
export interface ElementNode {
  readonly kind: "element";
  /** The tag name, e.g. `"button"` or `"tk-counter"`. */
  readonly name: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateNode[];
}

/** An attribute as written, e.g. name `"(click)"`, value `"inc()"`. */
export interface AttributeNode {
  readonly name: string;
  /** The value, or `""` for an attribute written without one. */
  readonly value: string;
}

/** Text, possibly containing `{{ }}` interpolations. */
export interface TextNode {
  readonly kind: "text";
  readonly value: string;
}

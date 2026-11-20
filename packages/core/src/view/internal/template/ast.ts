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

/** Where a node is in its template source: offsets, from the first character. */
export interface Span {
  readonly start: number;
  /** The offset just after the node. */
  readonly end: number;
}

/** An element, e.g. `<button (click)="inc()">`. */
export interface ElementNode {
  readonly kind: "element";
  /** The tag name, e.g. `"button"` or `"tk-counter"`. */
  readonly name: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateNode[];
  /**
   * From `<` to the end of the closing tag (or of the start tag, for an element
   * with none). Set by the parser; absent in a tree built by hand.
   */
  readonly span?: Span;
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
  /** The text as written. Set by the parser; absent in a tree built by hand. */
  readonly span?: Span;
}

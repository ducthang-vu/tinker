// A TemplateParser that uses the browser's own HTML parser.
//
// The source is parsed by a <template> element (whose content is never
// rendered or run), then the resulting DOM is converted into Tinker's tree.
//
// Limits inherited from the HTML parser, to be lifted by a parser of our own:
// - Tag and attribute names are lowercased: `[ariaLabel]` becomes `[arialabel]`.
// - Self-closing custom elements (`<tk-icon />`) are not closed: write `<tk-icon></tk-icon>`.
// - Malformed markup is silently "fixed" instead of reported.
// - There are no source positions for error messages.
// Comments are dropped.

import { Maybe } from "../../functional/index.ts";
import type { AttributeNode, TemplateNode } from "./ast.ts";
import type { TemplateParser } from "./parser.ts";

export class BrowserTemplateParser implements TemplateParser {
  /** @param document The document whose HTML parser is used (default: the global one). */
  constructor(private readonly document: Document = globalThis.document) {}

  parse(source: string): readonly TemplateNode[] {
    const template = this.document.createElement("template");
    template.innerHTML = source;
    return convertChildren(template.content);
  }
}

/** Convert a DOM node's children, skipping what the tree does not keep. */
function convertChildren(parent: Node): TemplateNode[] {
  return [...parent.childNodes].flatMap((child) =>
    convert(child)
      .match({ some: (node) => [node], none: () => [] }),
  );
}

/** The tree node for a DOM node, or None for what the tree does not keep. */
function convert(node: Node): Maybe<TemplateNode> {
  if (node.nodeType === node.ELEMENT_NODE) {
    const element = node as Element;
    const attributes: AttributeNode[] = [...element.attributes].map((a) => ({
      name: a.name,
      value: a.value,
    }));
    // A nested <template> keeps its children in `content`, not in `childNodes`.
    const childSource = element instanceof HTMLTemplateElement ? element.content : element;
    return Maybe.some({
      kind: "element",
      name: element.localName,
      attributes,
      children: convertChildren(childSource),
    });
  }
  if (node.nodeType === node.TEXT_NODE) {
    return Maybe.some({ kind: "text", value: (node as Text).data });
  }
  return Maybe.none(); // comments and anything else
}

// The parser abstraction. The engine depends only on this interface, so the
// parser can be swapped: today the browser's own HTML parser
// (BrowserTemplateParser), later a parser written for Tinker's syntax.

import type { TemplateNode } from "./ast.ts";

/** Turns template source into Tinker's syntax tree. */
export interface TemplateParser {
  /** Parse `source` into the template's top-level nodes. */
  parse(source: string): readonly TemplateNode[];
}

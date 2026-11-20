// The parser abstraction. The engine depends only on this interface, so the
// parser can be swapped. The engine uses TinkerTemplateParser (tinker-parser.ts),
// which runs without a DOM.

import type { TemplateNode } from "./ast.ts";

/** Turns template source into Tinker's syntax tree. */
export interface TemplateParser {
  /** Parse `source` into the template's top-level nodes. */
  parse(source: string): readonly TemplateNode[];
}

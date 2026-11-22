// The classes a compiled tree names (its elements' directives and components) replaced:
// a precompiled tree names the real classes, so CLASS_REPLACEMENTS is applied to it here,
// once per component class, when the factory caches the tree.

import type { Class } from "../../../utils/types.ts";
import type { CompiledNode } from "./compile.ts";
import { map } from "@tinker/functional";

/** The tree with each class it names replaced by `replace`. Nodes without classes are kept. */
export function replaceClasses(
  nodes: readonly CompiledNode[],
  replace: (type: Class<object>) => Class<object>,
): CompiledNode[] {
  return nodes.map((node): CompiledNode => {
    switch (node.kind) {
      case "element":
        return {
          ...node,
          directives: node.directives.map(replace),
          component: map(node.component, replace),
          children: replaceClasses(node.children, replace),
        };
      case "declaration":
      case "map":
        return { ...node, body: replaceClasses(node.body, replace) };
      case "match":
        return {
          ...node,
          cases: node.cases.map((item) => ({ ...item, body: replaceClasses(item.body, replace) })),
          ...(node.default !== undefined && { default: replaceClasses(node.default, replace) }),
        };
      default:
        return node;
    }
  });
}

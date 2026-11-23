// The classes a compiled tree names: the directives and components of its elements,
// in tree order (a class named twice is listed twice).

import type { Class } from "../../../utils/types.ts";
import type { CompiledNode } from "./compile.ts";
import { match } from "@tinker/functional";

/** Every directive and component class `nodes` name, at any depth. */
export function classesIn(nodes: readonly CompiledNode[]): Class<object>[] {
  return nodes.flatMap((node): Class<object>[] => {
    switch (node.kind) {
      case "element":
        return [
          ...node.directives,
          ...match(node.component, { Some: (component) => [component], None: () => [] }),
          ...classesIn(node.children),
        ];
      case "declaration":
      case "map":
        return classesIn(node.body);
      case "match":
        return [
          ...node.cases.flatMap((item) => classesIn(item.body)),
          ...classesIn(node.default ?? []),
        ];
      default:
        return [];
    }
  });
}

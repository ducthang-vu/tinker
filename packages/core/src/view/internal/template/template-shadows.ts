// The names a template declares that hide another name the same place can see. A declaration is
// one of: a `@let`, the item or the destructured names of a `@map`, the names a `@case` binds, and
// the `let-` names of a `<template>`. It shadows a name when that name is a member of the
// component, an imported template function, a built-in, or a name declared around it (a block's,
// or an earlier `@let` of the same list). The build refuses a template with a shadowing name, so
// that the name a template reads is always the one its author meant.

import { BUILT_IN_NAMES } from "./built-in-functions.ts";
import type { CompiledNode } from "./compile.ts";
import type { Pattern } from "./pattern.ts";

/** A declared name that hides another: the name, and what it hides, in words for a message. */
export interface Shadow {
  readonly name: string;
  readonly hides: string;
}

/**
 * The names of a template that shadow another. `hidden` gives each name the component (or the
 * template's imports) has, with what it is: `"a member of Page"`, `"the template function Fmt"`.
 *
 * @param nodes The compiled nodes of a template.
 * @param hidden The names the template's own top level must not redeclare, with what each is.
 * @returns Each shadowing declaration, in template order.
 */
export function shadowsIn(
  nodes: readonly CompiledNode[],
  hidden: ReadonlyMap<string, string>,
): readonly Shadow[] {
  const found: Shadow[] = [];
  const builtIn = new Map(BUILT_IN_NAMES.map((name) => [name, "a built-in template function"]));
  visit(nodes, new Set(), new Map([...builtIn, ...hidden]), found);
  return found;
}

/** Checks one list of nodes: `outer` holds the names declared around it. */
function visit(
  nodes: readonly CompiledNode[],
  outer: ReadonlySet<string>,
  hidden: ReadonlyMap<string, string>,
  found: Shadow[],
): void {
  // The names this list can see: those around it, and each `@let` above the node.
  const visible = new Set(outer);
  const declare = (names: readonly string[]): void => {
    for (const name of names) {
      const hides = visible.has(name) ? "a name declared around it" : hidden.get(name);
      if (hides !== undefined) {
        found.push({ name, hides });
      }
    }
  };
  for (const node of nodes) {
    if (node.kind === "let") {
      declare([node.name]);
      visible.add(node.name);
    } else if (node.kind === "map") {
      const names = patternNames(node.item);
      declare(names);
      visit(node.body, withNames(visible, names), hidden, found);
    } else if (node.kind === "match") {
      for (const { pattern, body } of node.cases) {
        const names = patternNames(pattern);
        declare(names);
        visit(body, withNames(visible, names), hidden, found);
      }
      if (node.default !== undefined) {
        visit(node.default, visible, hidden, found);
      }
    } else if (node.kind === "declaration") {
      declare(node.names);
      visit(node.body, withNames(visible, node.names), hidden, found);
    } else if (node.kind === "element") {
      visit(node.children, visible, hidden, found);
    }
  }
}

function withNames(visible: ReadonlySet<string>, names: readonly string[]): Set<string> {
  return new Set([...visible, ...names]);
}

/** The names a pattern binds: `x`, `{ a: x }`, `[x, ...rest]`, `… as x`, and a regex's groups. */
export function patternNames(pattern: Pattern): readonly string[] {
  switch (pattern.kind) {
    case "bind":
      return [pattern.name];
    case "as":
      return [pattern.name, ...patternNames(pattern.pattern)];
    case "object":
      return pattern.fields.flatMap((field) => patternNames(field.pattern));
    case "array":
      return [
        ...pattern.items.flatMap((item) => patternNames(item)),
        ...(pattern.rest === undefined ? [] : [pattern.rest]),
      ];
    case "alt":
      return pattern.options.flatMap((option) => patternNames(option));
    case "some":
    case "ok":
    case "error":
      return patternNames(pattern.pattern);
    case "regex":
      return [...pattern.names];
    default:
      return [];
  }
}

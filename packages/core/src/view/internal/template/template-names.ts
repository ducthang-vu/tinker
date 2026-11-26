import type { CompiledNode } from "./compile.ts";
import { FORBIDDEN_MEMBERS } from "./evaluate.ts";

// The names a compiled template reads from its component, and the names it declares.
//
// The build checks each name a template reads against the component's members, the names the
// template declares, its imported template functions and the built-ins. A declaration is taken from
// anywhere in the template, not only from where it is in scope: the check may miss a name, but it
// does not refuse a name the template declares.

/** The names of a compiled template. */
export interface TemplateNames {
  /** The component names read by expressions: fields, and functions called by name. */
  readonly read: readonly string[];
  /** The names declared anywhere in the template: `@let`, `@map` items, bindings and refs. */
  readonly declared: readonly string[];
}

/**
 * The names a compiled template reads from its component, and the names it declares.
 *
 * @param nodes The compiled nodes, or any tree of values that contains them.
 * @returns The read and the declared names, each once.
 */
export function namesIn(nodes: unknown): TemplateNames {
  const read = new Set<string>();
  const declared = new Set<string>();
  visit(nodes, read, declared);
  return { read: [...read], declared: [...declared] };
}

/** The keys that declare a name (a `let`, a pattern binding, a rest name, a reference). */
const DECLARING_KEYS = ["name", "names", "rest"] as const;

function visit(value: unknown, read: Set<string>, declared: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, read, declared);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const node = value as Record<string, unknown>;
  // A property's `name` is a read, not a declaration.
  if (node.kind === "property") {
    const receiver = node.receiver as { readonly kind?: unknown } | undefined;
    if (receiver?.kind === "component" && typeof node.name === "string") {
      read.add(node.name);
    }
  } else {
    for (const key of DECLARING_KEYS) {
      declare(node[key], declared);
    }
  }
  for (const child of Object.values(node)) {
    visit(child, read, declared);
  }
}

function declare(value: unknown, declared: Set<string>): void {
  if (typeof value === "string") {
    declared.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        declared.add(item);
      }
    }
  }
}

/**
 * The names a compiled template reads that are not visible where it reads them: a name is visible
 * if the scope of the read declares it (a `@let` before it, a `@map` item or `@case` binding around
 * it, a template reference on its element or before it, a `let-` name in a template), or if `known`
 * has it, or if it starts with `$` (a template special). A name declared elsewhere in the template
 * is not visible: a read outside its block is unknown.
 *
 * @param nodes The compiled nodes of the template.
 * @param known The names visible everywhere: the component's members, its imported template
 *   functions, and the built-ins.
 * @returns The unknown names, each once.
 */
export function unknownReads(nodes: readonly CompiledNode[], known: ReadonlySet<string>): string[] {
  const unknown = new Set<string>();
  visitScopedAll(nodes, new Set(), known, unknown);
  return [...unknown];
}

/** Visit sibling nodes in order: a name one declares (a `@let`, a reference) is visible after. */
function visitScopedAll(
  nodes: readonly CompiledNode[],
  scope: ReadonlySet<string>,
  known: ReadonlySet<string>,
  unknown: Set<string>,
): void {
  let visible: ReadonlySet<string> = scope;
  for (const node of nodes) {
    visible = visitScoped(node, visible, known, unknown);
  }
}

/** Visit one node; returns the names visible to the nodes after it. */
function visitScoped(
  node: CompiledNode,
  scope: ReadonlySet<string>,
  known: ReadonlySet<string>,
  unknown: Set<string>,
): ReadonlySet<string> {
  switch (node.kind) {
    case "text":
      readInto(node.interpolation.expressions, scope, known, unknown);
      return scope;
    case "let":
      readInto(node.expression, scope, known, unknown);
      return new Set([...scope, node.name]);
    case "map": {
      // The list is read outside the block; the item is visible to its `track` and its body.
      readInto(node.list, scope, known, unknown);
      const inItem = withNames(scope, namesIn(node.item).declared);
      if (node.track !== undefined) {
        readInto(node.track, inItem, known, unknown);
      }
      visitScopedAll(node.body, inItem, known, unknown);
      return scope;
    }
    case "match": {
      if (node.subject !== undefined) {
        readInto(node.subject, scope, known, unknown);
      }
      for (const current of node.cases) {
        const inCase = withNames(scope, namesIn(current.pattern).declared);
        if (current.guard !== undefined) {
          readInto(current.guard, inCase, known, unknown);
        }
        visitScopedAll(current.body, inCase, known, unknown);
      }
      if (node.default !== undefined) {
        visitScopedAll(node.default, scope, known, unknown);
      }
      return scope;
    }
    case "declaration": {
      const declared = withNames(scope, [node.name, ...node.names]);
      visitScopedAll(node.body, declared, known, unknown);
      return withNames(scope, [node.name]);
    }
    case "element": {
      // The bindings are read where the element is: its own references are visible to them.
      const references = withNames(scope, namesIn(node.references).declared);
      readInto(
        {
          classBindings: node.classBindings,
          classObjects: node.classObjects,
          styleBindings: node.styleBindings,
          attributeBindings: node.attributeBindings,
          inputBindings: node.inputBindings,
          outputBindings: node.outputBindings,
        },
        references,
        known,
        unknown,
      );
      visitScopedAll(node.children, references, known, unknown);
      return references;
    }
    case "slot":
      return scope;
  }
}

/** The names read by `value` that are not visible: added to `unknown`. */
function readInto(
  value: unknown,
  scope: ReadonlySet<string>,
  known: ReadonlySet<string>,
  unknown: Set<string>,
): void {
  for (const name of namesIn(value).read) {
    if (!scope.has(name) && !known.has(name) && !name.startsWith("$")) {
      unknown.add(name);
    }
  }
}

/** `scope` with `names` added. */
function withNames(scope: ReadonlySet<string>, names: readonly string[]): ReadonlySet<string> {
  return new Set([...scope, ...names]);
}

/**
 * The forbidden members a compiled template reads (`constructor`, `__proto__`, `prototype`), each
 * once. The run time refuses them too; the build refuses them so the page is never built.
 *
 * @param nodes The compiled nodes, or any tree of values that contains them.
 * @returns The forbidden member names read.
 */
export function forbiddenMembersIn(nodes: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object" || value === null) {
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.kind === "property" && typeof node.name === "string" && FORBIDDEN_MEMBERS.has(node.name)) {
      found.add(node.name);
    }
    Object.values(node)
      .forEach(walk);
  };
  walk(nodes);
  return [...found];
}

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

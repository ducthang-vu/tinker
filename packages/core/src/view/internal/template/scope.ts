// The names a template's expressions can read: the component's fields, and
// the template variables declared with `@let` (which shadow the fields).
//
// One Scope is made per template. The component is what bare names fall back
// to. `lets` holds, for each `@let` declared so far, a computed signal of its
// value: reading it inside a watch makes the watch depend on what it reads.

import type { ReadonlySignal } from "../../../signals/index.ts";

/**
 * Dev-mode checks: warnings about template code that works but is probably a mistake. Only
 * made in development mode (DEV_MODE); a scope without them checks nothing.
 */
export interface NameChecks {
  /** Warns with `message`, once per message. */
  warn(message: string): void;
}

/** The checks of development mode: warnings go to console.warn, each message once. */
export function devChecks(): NameChecks {
  const warned = new Set<string>();
  return {
    warn: (message) => {
      if (!warned.has(message)) {
        warned.add(message);
        console.warn(message);
      }
    },
  };
}

export class Scope {
  /**
   * @param component The component: what names not declared with `@let` are read from.
   * @param checks The dev-mode checks, if the app is in development mode.
   */
  constructor(
    readonly component: object,
    readonly lets: Map<string, ReadonlySignal<unknown>> = new Map(),
    readonly checks?: NameChecks,
  ) {}
}

/**
 * Dev-mode warnings for names a block declares that hide another: a name declared around the
 * block, or a member of the component. The build refuses these in a template it compiles, so a
 * warning here is for one it could not see (a member inherited from a base class, or a template
 * that was not compiled at build time).
 *
 * @param component The component, whose members are the names it can hide.
 * @param checks The dev-mode checks; nothing is checked without them.
 * @param around The names declared around the block.
 * @param names The names the block declares.
 */
export function warnShadows(
  component: object,
  checks: NameChecks | undefined,
  around: ReadonlyMap<string, unknown>,
  names: Iterable<string>,
): void {
  if (checks === undefined) {
    return;
  }
  for (const name of names) {
    if (around.has(name)) {
      checks.warn(`${name} shadows a name declared around it: rename one of them`);
    } else if (name in component) {
      checks.warn(`${name} hides the ${component.constructor.name} member of the same name`);
    }
  }
}

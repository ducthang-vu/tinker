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

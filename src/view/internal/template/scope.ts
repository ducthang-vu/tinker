// The names a template's expressions can read: the component's fields, and
// the template variables declared with `@let` (which shadow the fields).
//
// One Scope is made per template. The component is what bare names fall back
// to. `lets` holds, for each `@let` declared so far, a computed signal of its
// value: reading it inside a watch makes the watch depend on what it reads.

import type { ReadonlySignal } from "../../../signals/index.ts";

export class Scope {
  /** @param component The component: what names not declared with `@let` are read from. */
  constructor(
    readonly component: object,
    readonly lets: Map<string, ReadonlySignal<unknown>> = new Map(),
  ) {}
}

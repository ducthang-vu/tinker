// The names a template's expressions can read: the component's fields, and
// the template variables declared with `@let` (which shadow the fields).
//
// One Scope is made per template. The component is what bare names fall back
// to, and `lets` holds the value of each `@let` declared so far.

export class Scope {
  /** The `@let` values, by name. A declaration sets its name before later bindings read it. */
  readonly lets = new Map<string, unknown>();

  /** @param component The component: what names not declared with `@let` are read from. */
  constructor(readonly component: object) {}
}

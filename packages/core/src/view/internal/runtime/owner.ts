// Qualified bindings: `[abc.input]` and `(abc.output)` reach only the directive or
// component whose selector is `abc`. The name a selector gives is the selector without
// its brackets: `[abc]` is `abc`, and an element selector such as `tk-tip` is its name.

/** A directive or component on an element, with the name its selector gives it. */
export interface Owned {
  readonly owner: string;
  readonly instance: object;
}

/** The owner name of a selector: `[abc]` gives `abc`; anything else is kept as written. */
export function ownerName(selector: string): string {
  return selector.replace(/^\[(.*)\]$/, "$1");
}

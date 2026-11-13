// Forward references: refer to something that is not defined yet.
//
// JavaScript classes are not hoisted, so a class cannot be used as a value
// before its declaration has run (e.g. in decorator options of a class
// declared earlier in the same file, or across circular module imports).
// `ForwardRef.of(() => Later)` defers the reference: the framework calls
// `resolveForwardRef(value)` when it reads the value, once everything exists.
//
// A ForwardRef is its own type, not disguised as the value it refers to: an
// API that accepts one says so (`MaybeForwardRef<T>`), so TypeScript makes
// sure it is resolved before it is used.

export class ForwardRef<T> {
  /** Create a reference to the value `fn` returns, read when it is resolved. */
  static of<T>(fn: () => T): ForwardRef<T> {
    return new ForwardRef(fn);
  }

  private constructor(private readonly fn: () => T) {}

  /** The referenced value, read now (so it is always the current one). */
  resolve(): T {
    return this.fn();
  }
}

/** A value, or a forward reference to it. */
export type MaybeForwardRef<T> = T | ForwardRef<T>;

/** The referenced value if `value` is a ForwardRef, otherwise `value` itself. */
export function resolveForwardRef<T>(value: MaybeForwardRef<T>): T {
  return value instanceof ForwardRef ? value.resolve() : value;
}

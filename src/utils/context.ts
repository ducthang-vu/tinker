// A context variable: a value that is set for the duration of a call and
// restored afterwards. Used for "who is reading right now?" in signals (the
// active consumer) and "which injector does inject() use?" in DI (the
// injection context).
//
// Values are saved and restored, never pushed onto a list, so nested uses
// stack naturally: each `run` restores exactly what was there before it.

export class Context<T> {
  /** @param current The value outside any `run` (e.g. `null` or `undefined`). */
  constructor(private current: T) {}

  /** The current value. */
  get(): T {
    return this.current;
  }

  /** Set the current value, and return the previous one so it can be restored. */
  set(value: T): T {
    const previous = this.current;
    this.current = value;
    return previous;
  }

  /**
   * Run `fn` with `value` as the current value, and return its result.
   * The previous value is restored afterwards, even if `fn` throws.
   */
  run<R>(value: T, fn: () => R): R {
    const previous = this.set(value);
    try {
      return fn();
    } finally {
      this.current = previous;
    }
  }
}

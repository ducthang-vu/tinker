// The global "who is reading right now?".
//
// While a consumer (such as a computed or a watch) runs, it is the active
// consumer. Every producer read during that time links itself to it.

import { Context } from "../../../utils/context.ts";
import type { Consumer } from "../types.ts";

/** The consumer that is reading right now, or `null`. */
export const activeConsumer = new Context<Consumer | null>(null);

/**
 * Run `fn` with no active consumer, and return its result. Nothing read
 * inside becomes a dependency of the surrounding consumer. The previous
 * active consumer is restored afterwards, even if `fn` throws.
 */
export function untracked<T>(fn: () => T): T {
  return activeConsumer.run(null, fn);
}

/**
 * Run `fn`, and count the producers it reads (signals and computed values) directly from it. Each
 * read that links to the counting consumer is one. The surrounding consumer does not see those
 * reads, as with `untracked`.
 *
 * @privateAPI For the view's memoised template functions, to warn about a read the memo would miss.
 *
 * @param fn The function to run.
 * @returns What `fn` returned, and how many reads it made.
 */
export function countReads<T>(fn: () => T): { value: T; reads: number } {
  let reads = 0;
  const counter: Consumer = {
    allowWrites: true,
    addDependency: () => {
      reads++;
    },
    markDirty: () => undefined,
  };
  const value = activeConsumer.run(counter, fn);
  return { value, reads };
}

/**
 * Method decorator: while the method runs, `this` is the active consumer.
 * The previous one is restored afterwards, even if the method throws.
 */
export function tracked<This extends Consumer, Args extends unknown[], Return>(
  method: (this: This, ...args: Args) => Return,
  _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return {
  return function (this: This, ...args: Args): Return {
    return activeConsumer.run(this, () => method.call(this, ...args));
  };
}

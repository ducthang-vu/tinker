// The injection context: the injector `inject()` resolves from right now.
// Like the active consumer in signals, it is a global that is saved before
// and restored after each use, so nested creations stack naturally.

import { Context } from "../../../utils/context.ts";
import type { Injector } from "../injector.ts";

/** The injector of the current injection context, or `undefined` outside one. */
export const currentInjector = new Context<Injector | undefined>(undefined);

/**
 * Run `fn` with `injector` as the injection context, and return its result.
 * The previous context is restored afterwards, even if `fn` throws.
 */
export function runInInjectionContext<T>(injector: Injector, fn: () => T): T {
  return currentInjector.run(injector, fn);
}

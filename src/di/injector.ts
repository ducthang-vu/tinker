// The public Injector: an opaque handle, never a Service Locator.
//
// Users get the current injector with `inject(Injector)` and can pass it
// around, but it has no methods: the only thing to do with it is to give it
// back to the framework, e.g. `runInInjectionContext(injector, fn)`, so code
// running later still resolves from the right place.
//
// At runtime the handle is the internal injector itself, typed as opaque:
// reaching anything else means deliberately breaking the type contract.

import { adaptProvider, registerClassToken } from "./adapter.ts";
import { runInInjectionContext as internalRunInInjectionContext } from "./internal/context/current-injector.ts";
import type { Token } from "./internal/inject.ts";
import { INJECTOR, Injector as InternalInjector } from "./internal/injector.ts";
import type { Provider } from "./providers.ts";

/** What `Injector.create()` builds an injector from. */
export interface CreateInjectorOptions {
  /** How to create the values this injector provides. */
  readonly providers?: readonly Provider[];
  /** The parent: tokens not provided here are looked up there. */
  readonly parent?: Injector;
}

/**
 * What `Injector.create()` returns: the new injector, and the power to destroy
 * it. Only the creator holds this ref, so code that merely injects the
 * injector cannot tear it down from under its owner.
 */
export interface InjectorRef {
  /** The created injector. */
  readonly injector: Injector;
  /**
   * Destroy the injector: its children first, then `onDestroy()` of the values
   * it created. Calling it again does nothing.
   */
  destroy(): void;
}

/**
 * An injector, as users see it: the type of `inject(Injector)`, the token
 * for it, and `Injector.create()`. It is opaque: no methods, and abstract,
 * so it cannot be instantiated.
 *
 * Final: do not subclass it. TypeScript cannot enforce this (the constructor
 * must stay public for the class to be usable as a token), but only
 * `Injector.create()` and the framework make real injectors; a subclass
 * instance would break `runInInjectionContext()` and everything else.
 *
 * @final
 */
export abstract class Injector {
  /** Type-only brand: makes the class nominal, so a plain `{}` cannot pass for one. */
  declare private readonly brand: void;

  /**
   * Create an injector from public providers (and, optionally, a parent).
   * Returns a ref: the injector, and `destroy()` for its creator.
   */
  static create(options: CreateInjectorOptions = {}): InjectorRef {
    const internal = new InternalInjector(
      (options.providers ?? []).map(adaptProvider),
      options.parent && toInternal(options.parent),
    );
    return { injector: toPublic(internal), destroy: () => internal.destroy() };
  }
}

// `inject(Injector)` turns the class into a token with the class adapter:
// make that token the internal INJECTOR, which every injector provides.
registerClassToken(Injector, INJECTOR as unknown as Token<Injector>);

/**
 * Run `fn` with `injector` as the injection context, and return its result:
 * `inject()` works inside `fn` and resolves from that injector. The previous
 * context is restored afterwards, even if `fn` throws.
 */
export function runInInjectionContext<T>(injector: Injector, fn: () => T): T {
  return internalRunInInjectionContext(toInternal(injector), fn);
}

/** The handle is the internal injector itself, typed as opaque. */
function toPublic(injector: InternalInjector): Injector {
  return injector as unknown as Injector;
}

function toInternal(injector: Injector): InternalInjector {
  return injector as unknown as InternalInjector;
}

// The Injector: gives the value for a token, using its providers.
// Internal: users never see it (see the design rule in inject.ts).

import { runInInjectionContext } from "./context/current-injector.ts";
import { InjectionToken, type Token } from "./inject.ts";
import { type CreationHooks, type Provider, ProviderRecords } from "./provider-records.ts";
import { findRootProvider } from "./root-providers.ts";

/** A value that wants to clean up when the injector that created it is destroyed. */
export interface OnDestroy {
  onDestroy(): void;
}

function hasOnDestroy(value: unknown): value is OnDestroy {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<OnDestroy>).onDestroy === "function"
  );
}

/**
 * How an injector's provider records create values (module-private): each
 * factory runs in the injector's injection context, and each created value
 * with an `onDestroy()` method is cleaned up when the injector is destroyed.
 */
class InjectorCreationHooks implements CreationHooks {
  constructor(private readonly injector: Injector) {}

  create<T>(factory: () => T): T {
    return runInInjectionContext(this.injector, factory);
  }

  created(value: unknown): void {
    if (hasOnDestroy(value)) {
      this.injector.addDestroyCallback(() => value.onDestroy());
    }
  }
}

/**
 * The token for the injector itself. Every injector provides it, first, so
 * it cannot be overridden: `inject(INJECTOR)` gives the nearest injector,
 * i.e. the one whose injection context is current.
 */
export const INJECTOR: Token<Injector> = new InjectionToken<Injector>("Injector");

/**
 * Gives the value for a token, using its providers. Injectors form a
 * hierarchy: each one has a parent, except the root. Destroying an injector
 * destroys its children, and lets the values it created clean up.
 */
export class Injector {
  /** Whether `inject(token, { host: true })` stops looking after this injector. */
  readonly hostBoundary: boolean;

  private readonly destroyCallbacks = new Set<() => void>();
  private isDestroyed = false;
  /** Removes this injector's own entry from its parent's destroy callbacks. */
  private readonly detachFromParent: (() => void) | undefined;
  private readonly records: ProviderRecords;

  /**
   * @param providers How to create the value of each token this injector knows.
   * @param parent The parent injector; without one, this injector is the root.
   * @param options `hostBoundary`: set by the framework on a component's injector.
   */
  constructor(
    providers: readonly Provider<unknown>[],
    readonly parent?: Injector,
    options: { readonly hostBoundary?: boolean } = {},
  ) {
    this.records = new ProviderRecords(
      [{ token: INJECTOR, factory: () => this }, ...providers],
      new InjectorCreationHooks(this),
    );
    this.hostBoundary = options.hostBoundary ?? false;
    this.detachFromParent = parent?.addDestroyCallback(() => this.destroy());
  }

  /** Whether `destroy()` has been called. */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  /**
   * Run `callback` when this injector is destroyed. Returns a function that
   * unregisters it. Throws if the injector is already destroyed.
   */
  addDestroyCallback(callback: () => void): () => void {
    this.assertNotDestroyed();
    // Wrapped, so the same function registered twice is kept twice.
    const entry = () => callback();
    this.destroyCallbacks.add(entry);
    return () => this.destroyCallbacks.delete(entry);
  }

  /**
   * Destroy this injector: its children first (they registered themselves
   * on it), then the cleanups of the values it created and of `addDestroyCallback`
   * callbacks, newest first. Every cleanup runs even if one throws; the
   * first error is re-thrown at the end. Calling it again does nothing.
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.detachFromParent?.();
    const callbacks = [...this.destroyCallbacks].reverse();
    this.destroyCallbacks.clear();
    let failure: { error: unknown } | undefined;
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) {
      throw failure.error;
    }
  }

  /** Whether this injector is the root of its hierarchy (it has no parent). */
  isRoot(): boolean {
    return this.parent === undefined;
  }

  /**
   * Whether this injector itself has a provider for `token` (its parents are
   * not checked; a root injector also counts root providers, see
   * root-providers.ts). Lets the framework walk up the tree without using errors
   * as control flow, so an error thrown while *creating* a value is never
   * mistaken for "not provided here".
   */
  has(token: Token<unknown>): boolean {
    this.assertNotDestroyed();
    return this.records.has(token) || (this.isRoot() && findRootProvider(token) !== undefined);
  }

  /**
   * The value for `token`, created once per injector and then shared.
   * Throws if no provider is registered for it. The value is created with
   * this injector as the injection context, so its own `inject()` calls
   * resolve from the injector that owns it. If it has an `onDestroy()`
   * method, that is called when this injector is destroyed.
   */
  get<T>(token: Token<T>): T {
    this.assertNotDestroyed();
    if (this.isRoot() && !this.records.has(token)) {
      // A root injector also provides root providers: adopt it on first use.
      const provider = findRootProvider(token);
      if (provider) {
        this.records.add(provider);
      }
    }
    return this.records.get(token);
  }

  private assertNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new Error("Injector has already been destroyed");
    }
  }
}

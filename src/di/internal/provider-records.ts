// Provider records: everything an injector knows per token.
//
// Each record holds the token's provider and, once created, its value: every
// value is created once per injector, then shared (singleton per injector).
// A multi token's record holds all its providers, in order, and its value is
// the list of their values.
// While its factory runs, a record is marked as being created: asking for it
// again in that state means a dependency cycle.
// The records create values themselves, through hooks given by the injector,
// so they don't need to know what an injector is.

import type { Token } from "./inject.ts";

/**
 * How to create the value for a token. Internal: users will describe
 * providers in friendlier forms, which are turned into this.
 */
export interface Provider<T> {
  readonly token: Token<T>;
  readonly factory: () => T;
}

/** What the records ask their injector to do when creating a value. */
export interface CreationHooks {
  /** Run a provider's factory (the injector runs it in its injection context). */
  create<T>(factory: () => T): T;
  /** A value was just created (the injector registers its cleanup). */
  created(value: unknown): void;
}

/**
 * One value being created: which token, and who is creating it (e.g. the
 * provider records of one injector). The same token may legitimately be
 * created by two owners at once, such as a child wrapping its parent's value.
 */
export interface CreationStep {
  readonly owner: object;
  readonly token: Token<unknown>;
}

/** Thrown when creating a value needs that same value: A needs B, which needs A. */
export class CircularDependencyError extends Error {
  /**
   * Build the error from the values being created right now (outermost
   * first), when `owner` is asked again for `token`, which it is still
   * creating. The path starts where that creation began, so
   * `[C, A, B]` asked again for A gives `A → B → A`.
   */
  static fromCreationPath(
    creationPath: readonly CreationStep[],
    owner: object,
    token: Token<unknown>,
  ): CircularDependencyError {
    const start = creationPath.findIndex((step) => step.owner === owner && step.token === token);
    return new CircularDependencyError([
      ...creationPath.slice(start)
        .map((step) => step.token),
      token,
    ]);
  }

  /**
   * @param path The tokens being created when the cycle was found, ending
   *   with the token that was requested again, e.g. `[Cart, Payment, Cart]`.
   */
  constructor(readonly path: readonly Token<unknown>[]) {
    super(`Circular dependency: ${path.map((token) => token.name)
      .join(" → ")}`);
    this.name = "CircularDependencyError";
  }
}

/** Marks a record whose value has not been created yet. */
const UNSET: unique symbol = Symbol("UNSET");
/** Marks a record whose factory is running right now. */
const CREATING: unique symbol = Symbol("CREATING");

interface ProviderRecord<T> {
  /** One provider; several, in order, for a multi token. */
  readonly providers: Provider<unknown>[];
  value: T | typeof UNSET | typeof CREATING;
}

/**
 * The values being created right now, across all injectors, innermost last.
 * Only used to describe a cycle; each step's owner is the records creating it.
 */
const creationPath: CreationStep[] = [];

export class ProviderRecords {
  private readonly records = new Map<Token<unknown>, ProviderRecord<unknown>>();

  /**
   * @param providers Copied: changing the array later does not change the
   *   records. If several providers share a token, the first one wins.
   * @param hooks How values get created; given by the injector.
   */
  constructor(
    providers: readonly Provider<unknown>[],
    private readonly hooks: CreationHooks,
  ) {
    for (const provider of providers) {
      this.add(provider);
    }
  }

  /** Whether there is a provider for `token`. */
  has(token: Token<unknown>): boolean {
    return this.records.has(token);
  }

  /**
   * Add a provider (also after creation: root providers, on first use). For
   * a single token, does nothing if it already has one: the first one wins.
   * For a multi token, it is added to the token's list.
   */
  add(provider: Provider<unknown>): void {
    const record = this.records.get(provider.token);
    if (!record) {
      this.records.set(provider.token, { providers: [provider], value: UNSET });
    } else if (provider.token.multi) {
      record.providers.push(provider);
    }
  }

  /**
   * The value for `token`: created on the first call (through the hooks),
   * then the same value every time. Throws if there is no provider, and
   * throws CircularDependencyError if the value is needed while it is being
   * created. If creating throws, nothing is cached and the next call tries again.
   */
  get<T>(token: Token<T>): T {
    const record = this.records.get(token) as ProviderRecord<T> | undefined;
    if (!record) {
      throw new Error(`No provider for ${token.name}`);
    }
    if (record.value === CREATING) {
      throw CircularDependencyError.fromCreationPath(creationPath, this, token);
    }
    if (record.value !== UNSET) {
      return record.value;
    }

    record.value = CREATING;
    creationPath.push({ owner: this, token });
    let value: T;
    try {
      value = token.multi
        ? (record.providers.map((provider) => this.createValue(provider)) as T)
        : (this.createValue(record.providers[0]!) as T);
    } catch (error) {
      record.value = UNSET; // never leave CREATING behind: the next call tries again
      throw error;
    } finally {
      creationPath.pop();
    }
    record.value = value;
    return value;
  }

  /** Create one provider's value, through the hooks. */
  private createValue(provider: Provider<unknown>): unknown {
    const value = this.hooks.create(provider.factory);
    this.hooks.created(value);
    return value;
  }
}

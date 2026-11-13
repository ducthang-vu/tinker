import { tracked } from "./context/active-consumer.ts";
import { SignalCycleError } from "./errors.ts";
import { ConsumersContainer } from "./graph/consumers-container.ts";
import { DependenciesContainer } from "./graph/dependencies-container.ts";
import type { Consumer, EqualityFn, Producer, Readable } from "./types.ts";

/** Marks a value that does not exist yet (a computed that never ran). Module-private. */
const UNSET: unique symbol = Symbol("UNSET");

/**
 * The value of a computed while its computation runs (module-private).
 * Reading a computed in this state means it depends on itself.
 */
const COMPUTING: unique symbol = Symbol("COMPUTING");

/**
 * Holds an error thrown by a computation (module-private). Stored as the
 * computed's value, so the error is cached like a normal result and
 * re-thrown each time the value is read.
 */
class ComputedError {
  constructor(readonly error: unknown) {}
}

/** Return a cached value, or re-throw a cached error. */
function unwrap<T>(value: T | ComputedError): T {
  if (value instanceof ComputedError) {
    throw value.error;
  }
  return value;
}

/** The state the @cached decorator reads and writes on its object. */
interface CacheState<T> {
  dirty: boolean;
  value: T | ComputedError | typeof UNSET | typeof COMPUTING;
  readonly equal: EqualityFn<T>;
  readonly dependencies: DependenciesContainer;
  readonly consumers: ConsumersContainer;
}

/**
 * Cache (module-private decorator).
 * - Clean, with a value: return it without calling the method.
 * - Dirty (maybe stale): sync the dependencies. If none really changed,
 *   mark clean and return the cached value without calling the method.
 * - Otherwise call the method, store its result and mark clean. If the new
 *   result is equal to the old one (by `equal`), the old one is kept.
 *   Around the call, the dependency list is rebuilt and stale ones dropped.
 * - If the method throws, the error is cached as the value (and counts as a
 *   change). Reading a cached error re-throws it.
 * - While the method runs, the value is COMPUTING. Being called again in
 *   that state means a cycle, and throws SignalCycleError.
 */
function cached<This extends CacheState<Return> & Producer & Consumer, Return>(
  method: (this: This) => Return,
  _context: ClassMethodDecoratorContext<This, (this: This) => Return>,
): (this: This) => Return {
  return function (this: This): Return {
    if (this.value === COMPUTING) {
      throw new SignalCycleError();
    }
    if (this.value !== UNSET) {
      if (!this.dirty) {
        return unwrap(this.value);
      }
      if (!this.dependencies.changed()) {
        this.dirty = false;
        return unwrap(this.value);
      }
    }
    const old = this.value;
    let value: Return | ComputedError;
    this.value = COMPUTING;
    this.dependencies.start();
    try {
      value = method.call(this);
    } catch (error) {
      value = new ComputedError(error);
    } finally {
      // Runs even if the computation throws: keep what that run read.
      this.dependencies.finish(this);
      // Never leave COMPUTING behind.
      this.value = old;
    }
    this.dirty = false;
    const bothValues
      = old !== UNSET && !(old instanceof ComputedError) && !(value instanceof ComputedError);
    if (bothValues) {
      try {
        if (this.equal(old, value as Return)) {
          return old;
        }
      } catch (error) {
        // A failing equality function is cached like a failing computation.
        value = new ComputedError(error);
      }
    }
    this.value = value;
    this.consumers.bumpVersion();
    return unwrap(value);
  };
}

export class Computed<T> implements Consumer, Producer, Readable<T>, CacheState<T> {
  /** A computed is a pure derivation: it must not write signals. */
  readonly allowWrites = false;

  /**
   * Producers this computed read, each with the version it had when read.
   * @internal Not TypeScript-private, so the @cached decorator can use it.
   */
  readonly dependencies = new DependenciesContainer();

  /**
   * Consumers that read this computed, and its version.
   * @internal Not TypeScript-private, so the @cached decorator can use it.
   */
  readonly consumers = new ConsumersContainer();

  get version(): number {
    return this.consumers.version;
  }

  /**
   * True when a dependency may have changed since the last computation.
   * @internal Not TypeScript-private, so the @cached decorator can use it.
   */
  dirty = true;

  /**
   * The last computed value (or a cached error), or UNSET if it never ran.
   * @internal Not TypeScript-private, so the @cached decorator can use it.
   */
  value: T | ComputedError | typeof UNSET | typeof COMPUTING = UNSET;

  /**
   * @param computation Computes the value from other signals.
   * @param equal Decides whether a recomputed value counts as a change.
   *   When it returns true, the previous value is kept.
   *   @internal Not TypeScript-private, so the @cached decorator can use it.
   */
  constructor(
    private readonly computation: () => T,
    readonly equal: EqualityFn<T> = Object.is,
  ) {}

  // As a consumer

  addDependency(producer: Producer): void {
    this.dependencies.add(producer);
  }

  markDirty(): void {
    // Already dirty: our consumers were marked when we became dirty.
    if (this.dirty) {
      return;
    }
    this.dirty = true;
    // We may change, so whatever reads us may change too.
    this.consumers.markAllDirty();
  }

  // As a producer

  removeConsumer(consumer: Consumer): void {
    this.consumers.remove(consumer);
  }

  /** Read the value. Registers the active consumer (if any) as a reader. */
  get(): T {
    try {
      return this.compute();
    } finally {
      // Report *after* refreshing, so the reader records our new version.
      this.consumers.reportRead(this);
    }
  }

  /** Read the up-to-date value without registering a reader. */
  getUntracked(): T {
    return this.compute();
  }

  /**
   * Bring the value up to date without registering a reader. Never throws:
   * if the computation fails, the error is cached and re-thrown only to
   * whoever reads the value.
   */
  sync(): void {
    try {
      this.compute();
    } catch {
      // The error is cached in `value`; reading will re-throw it.
    }
  }

  // Order matters: decorators wrap from the bottom up, so a call runs
  //   @cached -> @tracked -> the method.
  // @cached sits outside @tracked, so a cache hit never becomes the active consumer.
  @cached
  @tracked
  private compute(): T {
    return this.computation();
  }
}

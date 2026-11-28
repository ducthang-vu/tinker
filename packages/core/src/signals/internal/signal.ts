import { isDevBuild } from "../../utils/dev-build.ts";
import { activeConsumer } from "./context/active-consumer.ts";
import { SignalWriteError } from "./errors.ts";
import { ConsumersContainer } from "./graph/consumers-container.ts";
import type { Consumer, EqualityFn, Producer, Readable } from "./types.ts";

/** A writable signal. It always has a value. */
export class Signal<T> implements Readable<T>, Producer {
  /** Consumers that read this signal. */
  private readonly consumers = new ConsumersContainer();

  get version(): number {
    return this.consumers.version;
  }

  private readonlyView: ReadonlySignal<T> | undefined;

  /** Whether `set` has warned about getting the object it holds: once per signal. */
  private warned = false;

  /**
   * @param value The initial value.
   * @param equal Decides whether a new value counts as a change. When it
   *   returns true, `set` does nothing and consumers are not marked dirty.
   */
  constructor(
    private value: T,
    private readonly equal: EqualityFn<T> = Object.is,
  ) {}

  /**
   * A read-only view of this signal. It has no `set` or `update`, even at
   * runtime, so it can be handed out without giving away write access.
   * Reading the view still tracks this signal.
   */
  asReadonly(): ReadonlySignal<T> {
    this.readonlyView ??= new ReadonlySignal(this);
    return this.readonlyView;
  }

  get(): T {
    this.consumers.reportRead(this);
    return this.value;
  }

  getUntracked(): T {
    return this.value;
  }

  removeConsumer(consumer: Consumer): void {
    this.consumers.remove(consumer);
  }

  /** A signal is always up to date, so there is nothing to do. */
  sync(): void {}

  set(value: T): void {
    const consumer = activeConsumer.get();
    if (consumer && !consumer.allowWrites) {
      throw new SignalWriteError();
    }
    if (this.equal(this.value, value)) {
      this.warnIfSameObject(value);
      return;
    }
    this.value = value;
    this.consumers.bumpVersion();
    this.consumers.markAllDirty();
  }

  /**
   * In a development build, warn (once per signal) when `set` gets the object or array the
   * signal already holds: nothing that reads the signal is told, which is a bug when the object
   * was changed in place. A signal changes only with a new value, a new reference for an object.
   */
  private warnIfSameObject(value: T): void {
    const sameObject = typeof value === "object" && value !== null && Object.is(this.value, value);
    if (sameObject && !this.warned && isDevBuild()) {
      this.warned = true;
      console.warn(
        "A signal was set to the object it already holds, so nothing that reads it is told. "
        + "If it was changed in place (push, sort, a field), set a new one instead, "
        + "e.g. [...list, item] or { ...item, done: true }.",
      );
    }
  }

  /** Set a new value computed from the current one. */
  update(fn: (current: T) => T): void {
    // Read the field directly, not through get(): updating is not a tracked read.
    this.set(fn(this.value));
  }
}

/**
 * A signal you can read but not write. It wraps a writable signal and only
 * exposes `get`, so it can be handed out without giving away write access.
 * Reading it tracks the underlying signal.
 */
export class ReadonlySignal<T> implements Readable<T> {
  constructor(private readonly source: Signal<T>) {}

  get(): T {
    return this.source.get();
  }

  getUntracked(): T {
    return this.source.getUntracked();
  }
}

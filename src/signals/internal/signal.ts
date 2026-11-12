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
      return;
    }
    this.value = value;
    this.consumers.bumpVersion();
    this.consumers.markAllDirty();
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

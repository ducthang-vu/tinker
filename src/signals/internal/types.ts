// The shapes of the reactive graph: interfaces and types, no code.

/** Something that reads producers and wants to know which ones it read. */
export interface Consumer {
  /**
   * Whether signals may be written while this consumer is running.
   * False for pure derivations (computed), true for side effects (watch).
   */
  readonly allowWrites: boolean;
  addDependency(producer: Producer): void;
  /** Called when something this consumer depends on has changed. */
  markDirty(): void;
}

/** Something that can be read, and keeps track of the consumers reading it. */
export interface Producer {
  /** Increases every time this producer's value really changes. */
  readonly version: number;
  /** Stop notifying `consumer`. (Adding happens when the producer is read.) */
  removeConsumer(consumer: Consumer): void;
  /** Bring the value up to date, without counting as a tracked read. */
  sync(): void;
}

/** Anything whose value can be read: signals, read-only signals and computeds. */
export interface Readable<T> {
  /** Read the value. If a consumer is active, it starts depending on this. */
  get(): T;
  /** Read the value without making the active consumer depend on it. */
  getUntracked(): T;
}

/** Decides whether two values count as equal. */
export type EqualityFn<T> = (a: T, b: T) => boolean;

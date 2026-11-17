import type { Consumer, Producer } from "../types.ts";

/**
 * The producers a consumer read, each with the version it had when read.
 * Internal: shared by Computed and Watch, not part of the public API.
 *
 * Each run collects its reads into a fresh list. When the run finishes,
 * whatever the previous run read but this run did not is stale: the
 * consumer unsubscribes from it.
 */
export class DependenciesContainer {
  private current = new Map<Producer, number>();
  private previous = new Map<Producer, number>();

  /** Call before a run: start collecting reads into a fresh list. */
  start(): void {
    this.previous = this.current;
    this.current = new Map();
  }

  /** Record a read. Reading the same producer again just updates its version. */
  add(producer: Producer): void {
    this.current.set(producer, producer.version);
  }

  /** Call after a run: unsubscribe `consumer` from producers it no longer reads. */
  finish(consumer: Consumer): void {
    for (const producer of this.previous.keys()) {
      if (!this.current.has(producer)) {
        producer.removeConsumer(consumer);
      }
    }
    this.previous = new Map();
  }

  /** Unsubscribe `consumer` from every dependency and forget them all. */
  clear(consumer: Consumer): void {
    for (const producer of this.current.keys()) {
      producer.removeConsumer(consumer);
    }
    this.current = new Map();
    this.previous = new Map();
  }

  /**
   * Bring every dependency up to date and report whether any of them
   * really changed since it was last read.
   */
  changed(): boolean {
    for (const [producer, seenVersion] of this.current) {
      producer.sync();
      if (producer.version !== seenVersion) {
        return true;
      }
    }
    return false;
  }
}

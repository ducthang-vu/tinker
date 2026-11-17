import { activeConsumer } from "../context/active-consumer.ts";
import { marking } from "../context/marking.ts";
import type { Consumer, Producer } from "../types.ts";

/**
 * The producer side's shared state: the consumers reading a producer, and
 * the producer's version. Internal: shared by Signal and Computed.
 *
 * The consumer side's counterpart is DependenciesContainer.
 */
export class ConsumersContainer {
  private readonly consumers = new Set<Consumer>();
  private currentVersion = 0;

  /** Increases every time the producer's value really changes. */
  get version(): number {
    return this.currentVersion;
  }

  /** Record that the producer's value really changed. */
  bumpVersion(): void {
    this.currentVersion++;
  }

  add(consumer: Consumer): void {
    this.consumers.add(consumer);
  }

  remove(consumer: Consumer): void {
    this.consumers.delete(consumer);
  }

  /**
   * Call when `producer` (the owner of this container) has been read.
   * If a consumer is active, link the two: the consumer records the producer
   * and its current version, and the producer records the consumer.
   */
  reportRead(producer: Producer): void {
    const consumer = activeConsumer.get();
    if (consumer) {
      consumer.addDependency(producer);
      this.add(consumer);
    }
  }

  /**
   * Tell every consumer that the producer may have changed. Runs as a
   * marking walk, so no user code runs until the whole graph is marked.
   */
  markAllDirty(): void {
    marking(() => {
      // Loop over a copy: the set can change while consumers react.
      for (const consumer of [...this.consumers]) {
        consumer.markDirty();
      }
    });
  }
}

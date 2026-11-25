// Run tasks where one failing must not stop the others: cleanups, queued
// updates, callbacks. Every task runs; the first error is re-thrown at the end.

import { Some, None, orElse, use, type Maybe } from "@tinker/functional";

/** Run every task, in order, even if some throw; then re-throw the first error. */
export function runAll(tasks: Iterable<() => void>): void {
  rethrow(firstFailure(tasks));
}

/**
 * Drain a queue in batches: run the batch `takeBatch` returns (as `runAll`
 * does), then the next one, until it returns an empty batch. Tasks queued
 * while a batch runs end up in a later batch. Every task runs even if some
 * throw; the first error is re-thrown once the queue is empty.
 */
export function runBatches(takeBatch: () => readonly (() => void)[]): void {
  let failure = None.of<unknown>();
  for (let batch = takeBatch(); batch.length > 0; batch = takeBatch()) {
    // Run the batch first (eagerly): `orElse` would skip it once a failure is kept.
    const batchFailure = firstFailure(batch);
    failure = orElse(failure, () => batchFailure);
  }
  rethrow(failure);
}

/** Run every task, in order, even if some throw. Returns the first error thrown. */
function firstFailure(tasks: Iterable<() => void>): Maybe<unknown> {
  let failure = None.of<unknown>();
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      failure = orElse(failure, () => Some.of(error));
    }
  }
  return failure;
}

function rethrow(failure: Maybe<unknown>): void {
  use(failure, { Some: (error) => {
    throw error;
  }, None: () => undefined });
}

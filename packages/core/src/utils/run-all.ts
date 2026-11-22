// Run tasks where one failing must not stop the others: cleanups, queued
// updates, callbacks. Every task runs; the first error is re-thrown at the end.

import { Maybe } from "@tinker/functional";
import { match, type Either, Left, Right, attempt } from "@tinker/functional/v1";

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
  let failure = Maybe.none<unknown>();
  for (let batch = takeBatch(); batch.length > 0; batch = takeBatch()) {
    // Run the batch first (eagerly): `orElse` would skip it once a failure is kept.
    const batchFailure = firstFailure(batch);
    failure = failure.orElse(() => batchFailure);
  }
  rethrow(failure);
}

/** Run every task, in order, even if some throw. Returns the first error thrown. */
function firstFailure(tasks: Iterable<() => void>): Maybe<unknown> {
  let failure = Maybe.none<unknown>();
  for (const task of tasks) {
    const outcome = attempt(task, (error): error is unknown => true);
    failure = failure.orElse(() => match(outcome, { Left: Maybe.some, Right: () => Maybe.none() }));
  }
  return failure;
}

function rethrow(failure: Maybe<unknown>): void {
  failure.ifSome((error) => {
    throw error;
  });
}

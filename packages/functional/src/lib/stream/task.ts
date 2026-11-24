// Task<T, E>: one value, later, or a failure. A lazy, cancellable Promise.
//
// A Task is a Stream with no items: it only ends, with its outcome, an `Either<T, E>`. So a task
// is a stream, run with `run`, and `map` and `flatMap` are the stream's: they transform what it
// ends with, and a failure short-circuits (see stream.ts for the grammar).
//
// - Lazy: nothing happens until `run`. The same task can be run again (e.g. retried).
// - Cancellable: `run` returns a cancel function, which stops the step that is running (clears a
//   timer, aborts a fetch through its AbortSignal). After cancelling, no callback is called.
// - A failure is a value, an `E`, `Error` by default. Anything a task's computation throws
//   becomes an Error (wrapped, keeping the original as its `cause`, if it was not one).
//
//   const cancel = run(
//     flatMap(fromPromise((signal) => fetch(url, { signal })), (response) =>
//       fromPromise(() => response.json())),
//     { ok: render, error: showError },
//   );
//
// Timers are tasks too: `delay(ms)`, and `timeout(task, ms)`.

import { type Either, Left, Right, toError } from "../monad/either.ts";
import { Continue, OUTCOME, type Outcome } from "../monad/outcome.ts";
import { type Cancel, run, Stream } from "./stream.ts";

/** A task: a stream with no items, ending with its outcome. */
export type Task<T, E = Error> = Stream<never, T, E>;

/** What to do with a task's outcome. */
export interface TaskHandlers<T, E = Error> {
  readonly ok?: (value: T) => void;
  /** Without it, a failure is re-thrown where it happens, so it is never silently lost. */
  readonly error?: (error: E) => void;
}

/**
 * How a task does its work: call `ok` or `error` once (later, or right away), and return how to
 * cancel it, if it can be.
 */
export type TaskComputation<T, E> = (
  ok: (value: T) => void,
  error: (error: E) => void,
) => Cancel | void;

/** The error of a task that took longer than its `timeout`. */
export class TimeoutError extends Error {
  /**
   * The error for a task that ran past its limit.
   *
   * @param milliseconds The limit the task ran past, in milliseconds.
   */
  constructor(readonly milliseconds: number) {
    super(`Task timed out after ${milliseconds} ms`);
    this.name = "TimeoutError";
  }
}

/**
 * A task doing `computation` when it is run. What it throws becomes a failure, an Error: hence
 * `E | Error`.
 *
 * @param computation How the task calls `ok` or `error`, and how to cancel it.
 * @returns A task that runs `computation` each time it is run.
 */
export function fromComputation<T, E = Error>(
  computation: TaskComputation<T, E>,
): Task<T, E | Error> {
  return Stream.from<never, T, E>((sink) =>
    computation(
      (value) => sink.end(Right.of<T, E>(value)),
      (error) => sink.end(Left.of<E, T>(error)),
    ));
}

/**
 * A task that succeeds with `value`.
 *
 * @param value The value the task succeeds with.
 * @returns A task that succeeds with `value`.
 */
export function succeed<T>(value: T): Task<T, never> {
  return Stream.end(value);
}

/**
 * A task that fails with `error`.
 *
 * @param error The error the task fails with.
 * @returns A task that fails with `error`.
 */
export function fail<E>(error: E): Task<never, E> {
  return Stream.fail(error);
}

/**
 * A task with the outcome of an Either: a Right succeeds, a Left fails.
 *
 * @param either The outcome the task has.
 * @returns A task with that outcome.
 */
export function fromOutcome<T, E>(either: Either<T, E>): Task<T, E> {
  return Stream.fromEither(either);
}

/**
 * A task running the promise `start` returns. `start` is called only when the task runs, and
 * receives an AbortSignal that is aborted on cancel. A rejection becomes a failure, an Error.
 *
 * @param start Makes the promise. It receives a signal that is aborted when the task is cancelled.
 * @returns A task that succeeds with the promise's value, or fails with its rejection.
 */
export function fromPromise<T>(start: (signal: AbortSignal) => PromiseLike<T>): Task<T, Error> {
  return fromComputation<T, Error>((ok, error) => {
    const controller = new AbortController();
    Promise.resolve(start(controller.signal))
      .then(ok, (reason) => error(toError(reason)));
    return () => controller.abort();
  });
}

/**
 * A task that succeeds after `milliseconds`. Cancelling clears the timer.
 *
 * @param milliseconds How long to wait, in milliseconds.
 * @returns A task that succeeds once the time has passed.
 */
export function delay(milliseconds: number): Task<void, Error> {
  return fromComputation<void, never>((ok) => {
    const timer = setTimeout(() => ok(undefined), milliseconds);
    return () => clearTimeout(timer);
  });
}

/**
 * `task`, failing with a TimeoutError if it takes longer than `milliseconds` (and cancelled).
 *
 * @param task The task to limit.
 * @param milliseconds The limit, in milliseconds.
 * @returns A task with the outcome of `task`, or a TimeoutError when it runs past the limit.
 */
export function timeout<T, E>(task: Task<T, E>, milliseconds: number): Task<T, E | Error> {
  return fromComputation<T, E | Error>((ok, error) => {
    const timer = setTimeout(() => {
      cancel();
      error(new TimeoutError(milliseconds));
    }, milliseconds);
    const cancel = run(task, {
      ok: (value) => {
        clearTimeout(timer);
        ok(value);
      },
      error: (reason) => {
        clearTimeout(timer);
        error(reason);
      },
    });
    return () => {
      clearTimeout(timer);
      cancel();
    };
  });
}

/**
 * Run the task as a Promise (which cannot be cancelled).
 *
 * @param task The task to run.
 * @returns A promise of the task's value, rejected with its failure.
 */
export function toPromise<T, E>(task: Task<T, E>): Promise<T> {
  return new Promise((resolve, reject) => {
    run(task, { ok: resolve, error: reject });
  });
}

/**
 * A task from any outcome: a Continue succeeds with its value, and a Halt fails with its reason.
 *
 * @param outcome Any value that implements the outcome protocol.
 * @returns A task that succeeds with the value, or fails with the reason.
 */
export function createTask<T, E>(outcome: Outcome<T, E>): Task<T, E> {
  const form = outcome[OUTCOME]();
  return form instanceof Continue ? succeed(form.value) : fail(form.reason);
}

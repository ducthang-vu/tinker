// Task<T, E>: one value, later (or a failure). A lazy, cancellable Promise.
//
// A Task is a Stream with no items: it only ends, with its outcome, an
// `Either<E, T>`. So everything a stream guarantees holds for it (see
// stream.ts), and `flatMap` is the stream's:
//
// - Lazy: nothing happens until `run()`. That makes Task a proper monad, and
//   lets the same task be run again (e.g. retried).
// - Cancellable: `run()` returns a cancel function, which stops the step that
//   is running (clears a timer, aborts a fetch through its AbortSignal).
//   After cancelling, no callback is called.
// - A failure is a value, an `E`, `Error` by default. Anything a task's
//   computation throws becomes an Error (wrapped, keeping the original as its
//   `cause`, if it was not one), so any task may fail with an `Error`.
//
// Like Maybe and Either, it is a monad with the same vocabulary:
//   Task.succeed(a)  a task that succeeds with `a`
//   task.map(f)     transform the result
//   task.flatMap(f) chain another task (cancelling cancels the current step)
//
//   const cancel = Task.fromPromise((signal) => fetch(url, { signal }))
//     .flatMap((response) => Task.fromPromise(() => response.json()))
//     .timeout(5000)
//     .run({ ok: render, error: showError });
//
// Timers are tasks too: `Task.delay(ms)`, and `task.timeout(ms)`.

import { Either, toError } from "./either.ts";
import { type Cancel, Stream } from "./stream.ts";

/** What to do with a task's outcome. */
export interface TaskHandlers<T, E = Error> {
  readonly ok?: (value: T) => void;
  /** Without it, a failure is re-thrown where it happens, so it is never silently lost. */
  readonly error?: (error: E) => void;
}

/**
 * How a task does its work: call `ok` or `error` once (later, or right away),
 * and return how to cancel it, if it can be.
 */
type Computation<T, E> = (ok: (value: T) => void, error: (error: E) => void) => Cancel | void;

/** The error of a task that took longer than its `timeout`. */
export class TimeoutError extends Error {
  constructor(readonly milliseconds: number) {
    super(`Task timed out after ${milliseconds} ms`);
    this.name = "TimeoutError";
  }
}

export class Task<T, E = Error> {
  private constructor(private readonly stream: Stream<never, T, E>) {}

  /**
   * A task doing `computation` when it is run. What it throws becomes a
   * failure, an Error: hence `E | Error`.
   */
  static create<T, E = Error>(computation: Computation<T, E>): Task<T, E | Error> {
    return new Task(Stream.create<never, T, E>((sink) =>
      computation(
        (value) => sink.end(Either.right(value)),
        (error) => sink.end(Either.left(error)),
      )));
  }

  /** A task that succeeds with `value`. */
  static succeed<T>(value: T): Task<T, never> {
    return new Task(Stream.end(value));
  }

  /** A task that fails with `error`. */
  static fail<E>(error: E): Task<never, E> {
    return new Task(Stream.fail(error));
  }

  /**
   * A task running the promise `start` returns. `start` is called only when
   * the task runs, and receives an AbortSignal that is aborted on cancel.
   * A rejection becomes a failure, an Error.
   */
  static fromPromise<T>(start: (signal: AbortSignal) => PromiseLike<T>): Task<T, Error> {
    return Task.create<T, Error>((ok, error) => {
      const controller = new AbortController();
      Promise.resolve(start(controller.signal))
        .then(ok, (reason) => error(toError(reason)));
      return () => controller.abort();
    });
  }

  /** A task with the Either's outcome: a Right succeeds, a Left fails. */
  static fromEither<E, T>(either: Either<E, T>): Task<T, E> {
    return new Task(Stream.fromEither(either));
  }

  /** A task that succeeds after `milliseconds`. Cancelling clears the timer. */
  static delay(milliseconds: number): Task<void, Error> {
    return Task.create<void, never>((ok) => {
      const timer = setTimeout(() => ok(undefined), milliseconds);
      return () => clearTimeout(timer);
    });
  }

  /**
   * Start the task. Exactly one of `ok` / `error` is called, at most once,
   * and none after cancelling. Returns the cancel function.
   */
  run(handlers: TaskHandlers<T, E> = {}): Cancel {
    return this.stream.run({ ok: handlers.ok, error: handlers.error });
  }

  /** This task as a stream: no items, ending with its outcome. */
  toStream(): Stream<never, T, E> {
    return this.stream;
  }

  /** Transform the result. An exception thrown by `f` fails the task. */
  map<U>(f: (value: T) => U): Task<U, E | Error> {
    return new Task(this.stream.map(f));
  }

  /** Chain another task (the monad's bind). Cancelling cancels whichever step is running. */
  flatMap<U, F>(f: (value: T) => Task<U, F>): Task<U, E | F | Error> {
    return new Task(this.stream.flatMap((value) => f(value).stream));
  }

  /** Fail with a TimeoutError if the task takes longer than `milliseconds` (and cancel it). */
  timeout(milliseconds: number): Task<T, E | Error> {
    return Task.create<T, E | Error>((ok, error) => {
      const timer = setTimeout(() => {
        cancel();
        error(new TimeoutError(milliseconds));
      }, milliseconds);
      const cancel = this.run({
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

  /** Run the task as a Promise (which cannot be cancelled). */
  toPromise(): Promise<T> {
    return new Promise((resolve, reject) => {
      this.run({ ok: resolve, error: reject });
    });
  }
}

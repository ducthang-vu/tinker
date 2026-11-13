// Task<T>: one value, later (or an error). A lazy, cancellable Promise.
//
// - Lazy: nothing happens until `run()`. That makes Task a proper monad, and
//   lets the same task be run again (e.g. retried).
// - Cancellable: `run()` returns a cancel function, which stops the step that
//   is running (clears a timer, aborts a fetch through its AbortSignal).
//   After cancelling, no callback is called.
//
// Like Maybe and Either, it is a monad with the same vocabulary:
//   Task.of(a)      unit: a task that succeeds with `a`
//   task.map(f)     transform the result
//   task.flatMap(f) chain another task (cancelling cancels the current step)
//
//   const cancel = Task.fromPromise((signal) => fetch(url, { signal }))
//     .flatMap((response) => Task.fromPromise(() => response.json()))
//     .timeout(5000)
//     .run({ ok: render, error: showError });
//
// Timers are tasks too: `Task.delay(ms)`, and `task.timeout(ms)`.

import type { Either } from "./either.ts";

/** Stops a running task. Calling it after the task finished does nothing. */
export type Cancel = () => void;

/** What to do with a task's outcome. */
export interface TaskHandlers<T> {
  readonly ok?: (value: T) => void;
  /** Without it, an error is re-thrown where it happens, so it is never silently lost. */
  readonly error?: (error: unknown) => void;
}

/**
 * How a task does its work: call `ok` or `error` once (later, or right away),
 * and return how to cancel it, if it can be.
 */
type Computation<T> = (ok: (value: T) => void, error: (error: unknown) => void) => Cancel | void;

/** The error of a task that took longer than its `timeout`. */
export class TimeoutError extends Error {
  constructor(readonly milliseconds: number) {
    super(`Task timed out after ${milliseconds} ms`);
    this.name = "TimeoutError";
  }
}

export class Task<T> {
  private constructor(private readonly computation: Computation<T>) {}

  /** A task doing `computation` when it is run. */
  static create<T>(computation: Computation<T>): Task<T> {
    return new Task(computation);
  }

  /** Unit (the monad's `return`): a task that succeeds with `value`. */
  static of<T>(value: T): Task<T> {
    return new Task((ok) => ok(value));
  }

  /** A task that fails with `error`. */
  static fail<T = never>(error: unknown): Task<T> {
    return new Task((_ok, fail) => fail(error));
  }

  /**
   * A task running the promise `start` returns. `start` is called only when
   * the task runs, and receives an AbortSignal that is aborted on cancel.
   */
  static fromPromise<T>(start: (signal: AbortSignal) => PromiseLike<T>): Task<T> {
    return new Task((ok, error) => {
      const controller = new AbortController();
      Promise.resolve(start(controller.signal))
        .then(ok, error);
      return () => controller.abort();
    });
  }

  /** A task with the Either's outcome: a Right succeeds, a Left fails. */
  static fromEither<E, T>(either: Either<E, T>): Task<T> {
    return either.match({ left: (error) => Task.fail<T>(error), right: (value) => Task.of(value) });
  }

  /** A task that succeeds after `milliseconds`. Cancelling clears the timer. */
  static delay(milliseconds: number): Task<void> {
    return new Task((ok) => {
      const timer = setTimeout(() => ok(undefined), milliseconds);
      return () => clearTimeout(timer);
    });
  }

  /**
   * Start the task. Exactly one of `ok` / `error` is called, at most once,
   * and none after cancelling. Returns the cancel function.
   */
  run(handlers: TaskHandlers<T> = {}): Cancel {
    let finished = false;
    const ok = (value: T) => {
      if (!finished) {
        finished = true;
        handlers.ok?.(value);
      }
    };
    const error = (reason: unknown) => {
      if (finished) {
        return;
      }
      finished = true;
      if (!handlers.error) {
        throw reason;
      }
      handlers.error(reason);
    };
    let cancel: Cancel | void;
    try {
      cancel = this.computation(ok, error);
    } catch (reason) {
      if (finished) {
        // Already settled: this is our own re-throw (no error handler), or a
        // handler that threw. It must not be swallowed.
        throw reason;
      }
      error(reason);
    }
    return () => {
      if (!finished) {
        finished = true;
        cancel?.();
      }
    };
  }

  /** Transform the result. An error thrown by `f` fails the task. */
  map<U>(f: (value: T) => U): Task<U> {
    return new Task((ok, error) =>
      this.run({
        ok: (value) => {
          let result: U;
          try {
            result = f(value);
          } catch (reason) {
            error(reason);
            return;
          }
          ok(result);
        },
        error,
      }),
    );
  }

  /** Chain another task (the monad's bind). Cancelling cancels whichever step is running. */
  flatMap<U>(f: (value: T) => Task<U>): Task<U> {
    return new Task((ok, error) => {
      // The step running now: the first task, then the one `f` returned.
      let cancelSecond: Cancel | undefined;
      const cancelFirst = this.run({
        ok: (value) => {
          let next: Task<U>;
          try {
            next = f(value);
          } catch (reason) {
            error(reason);
            return;
          }
          cancelSecond = next.run({ ok, error });
        },
        error,
      });
      return () => (cancelSecond ?? cancelFirst)();
    });
  }

  /** Fail with a TimeoutError if the task takes longer than `milliseconds` (and cancel it). */
  timeout(milliseconds: number): Task<T> {
    return new Task((ok, error) => {
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

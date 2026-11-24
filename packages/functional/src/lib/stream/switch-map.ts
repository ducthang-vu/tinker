// switchMap: runs a task for each value of a stream, and keeps only the newest. When a value
// arrives while a task is still running, that task is cancelled and reported as Superseded, and
// the new value starts its own task. The result has one item per value, in the order the values
// settled. It ends once the source has ended and no task is running. A failure of the source
// fails the result and cancels the running task; unsubscribing cancels it too.

import { type Either, Left, Right } from "../monad/either.ts";
import { match } from "../monad/monad.ts";
import { type Cancel, run, Stream, subscribe } from "./stream.ts";
import type { Task } from "./task.ts";

/** Why a value has no outcome of its own: a newer value replaced it before it settled. */
export class Superseded {
  private constructor() {}

  /**
   * The marker for a superseded value.
   *
   * @returns A Superseded.
   */
  static of(): Superseded {
    return new Superseded();
  }
}

/** One item of a switched stream: a source value, and what became of its task. */
export interface Switched<T, U, F> {
  /** The source value this item is about. */
  readonly value: T;
  /** The task's success or failure, or Superseded when a newer value replaced it. */
  readonly outcome: Either<U, F | Superseded>;
}

/** The task running for the current value, and how to cancel it. */
interface Active<T> {
  readonly value: T;
  readonly cancel: Cancel;
}

/**
 * Runs `f(value)` for each value of `source`, keeping only the newest running task.
 *
 * @param source The stream of values.
 * @param f Makes the task for a value.
 * @returns A stream of one item per value: its outcome, or Superseded.
 */
export function switchMap<T, R, E, U, F>(
  source: Stream<T, R, E>,
  f: (value: T) => Task<U, F>,
): Stream<Switched<T, U, F>, void, E | Error> {
  return Stream.from<Switched<T, U, F>, void, E>((sink) => {
    let active: Active<T> | undefined;
    let sourceEnded = false;

    const settle = (value: T, outcome: Either<U, F | Superseded>): void => {
      sink.next(Right.of<Switched<T, U, F>, E>({ value, outcome }));
    };

    const endIfDone = (): void => {
      if (sourceEnded && active === undefined) {
        sink.end(Right.of<void, E>(undefined));
      }
    };

    // A task that settles is the active one: a superseded task was cancelled, so it never
    // calls back.
    const complete = (value: T, outcome: Either<U, F | Superseded>): void => {
      active = undefined;
      settle(value, outcome);
      endIfDone();
    };

    const supersedeActive = (): void => {
      if (active !== undefined) {
        const previous = active;
        active = undefined;
        previous.cancel();
        settle(previous.value, Left.of<F | Superseded, U>(Superseded.of()));
      }
    };

    // A failure of the source ends the result with it, and cancels the task still running.
    const failWith = (error: E): void => {
      active?.cancel();
      active = undefined;
      sink.end(Left.of<E, void>(error));
    };

    const startTask = (value: T): void => {
      supersedeActive();
      let finished = false;
      const cancel = run(f(value), {
        ok: (result) => {
          finished = true;
          complete(value, Right.of<U, F | Superseded>(result));
        },
        error: (failure) => {
          finished = true;
          complete(value, Left.of<F | Superseded, U>(failure));
        },
      });
      if (!finished) {
        active = { value, cancel };
      }
    };

    const cancelSource = subscribe(source, {
      next: (item) => {
        match<T, E, void>(item, {
          Right: (value) => {
            startTask(value);
          },
          Left: (error) => {
            failWith(error);
          },
        });
      },
      end: (result) => {
        match<R, E, void>(result, {
          Right: () => {
            sourceEnded = true;
            endIfDone();
          },
          Left: (error) => {
            failWith(error);
          },
        });
      },
    });

    return () => {
      cancelSource();
      active?.cancel();
      active = undefined;
    };
  });
}

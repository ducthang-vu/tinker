// Stream<T, R, E>: many values, later. A stream delivers items, then ends:
//
//   item* end
//
// - An item is an `Either<T, E>`: a failure is a value, and it does NOT end the stream. Only two
//   things end a subscription: the source ending the stream, or the subscriber cancelling.
// - The end is an `Either<R, E>` too: `R` is what the stream ends with, or a `Left` when it ended
//   because it failed. After it, nothing more is delivered.
// - Cancelling is silent: after it, no item and no end arrives.
//
// The monad is on the END, not on the items: `map` and `flatMap` transform what the stream ends
// with. Failures short-circuit, as in Either: if the stream ends with a Left, the step never runs.
//
// Streams are cold: nothing happens until `subscribe` (or `run`), and each subscriber starts its
// own run. A hot source (values happen whether or not anyone listens) is `Stream.hot`.
//
//   const upload = Stream.from<number, Response>((sink) => { ... });
//   run(upload, { next: showProgress, ok: showResult, error: showError });

import { attempt, Left, mapLeft as mapLeftEither, Right, toError, type Either } from "./either.ts";
import { type Chain, CHAIN, flatMap, type Functor, MAP } from "./functor.ts";
import { match, use } from "./monad.ts";

/** Stops a running stream or task. Calling it after the end does nothing. */
export type Cancel = () => void;

/** What a stream's source calls to deliver items and to end. */
export interface StreamSink<T, R, E> {
  /** Deliver an item. Ignored after the end, or after a cancel. */
  next(item: Either<T, E>): void;
  /** End the stream. Only the first call counts; ignored after a cancel. */
  end(result: Either<R, E>): void;
}

/**
 * How a stream does its work: deliver items and end through `sink` (now, or later), and return how
 * to cancel, if it can be cancelled.
 */
export type StreamComputation<T, R, E> = (sink: StreamSink<T, R, E>) => Cancel | void;

/** What a subscriber is told. Both parts are optional. */
export interface StreamObserver<T, R, E> {
  readonly next?: (item: Either<T, E>) => void;
  readonly end?: (result: Either<R, E>) => void;
}

/** What to do with a stream's values, unwrapped: see `run`. */
export interface StreamHandlers<T, R, E> {
  /** Each successful item. */
  readonly next?: (value: T) => void;
  /** The end, if it succeeded. */
  readonly ok?: (result: R) => void;
  /**
   * Any failure, of an item or of the end. Without it, a failure is re-thrown where it happens, so
   * it is never silently lost.
   */
  readonly error?: (error: E) => void;
}

/** How a stream starts a run for an observer. Kept outside the class, for `subscribe` to read. */
type Start<T, R, E> = (observer: StreamObserver<T, R, E>) => Cancel;

const starts = new WeakMap<object, Start<unknown, unknown, unknown>>();

/**
 * A cold stream, of items and an end. Build one with `from`, `hot`, `end`, `fail`, `fromEither` or
 * `fromIterable`; read it with `subscribe` or `run`.
 *
 * @example
 * ```ts
 * import { run, Stream } from "@tinker/functional";
 *
 * run(Stream.fromIterable([1, 2]), { next: (n) => console.log(n) });
 * ```
 */
export class Stream<T, R = void, E = Error> implements Functor<R>, Chain<R> {
  private constructor(start: Start<T, R, E>) {
    starts.set(this, start as Start<unknown, unknown, unknown>);
  }

  /**
   * A stream doing `computation` each time it is subscribed to. An exception the computation throws
   * becomes a failure: the stream ends with a Left holding an Error (so `E | Error`).
   */
  static from<T, R = void, E = Error>(
    computation: StreamComputation<T, R, E>,
  ): Stream<T, R, E | Error> {
    return Stream.make(computation) as Stream<T, R, E | Error>;
  }

  /**
   * A hot stream: `subscribe` registers an observer and returns how to remove it. The source must
   * keep the grammar itself (items, then one end, and nothing after a cancel).
   */
  static hot<T, R, E>(subscribe: (observer: StreamObserver<T, R, E>) => Cancel): Stream<T, R, E> {
    return new Stream(subscribe);
  }

  /** No items, ends with `result`. */
  static end<R>(result: R): Stream<never, R, never> {
    return Stream.fromEither(Right.of(result));
  }

  /** No items, ends with the failure `error`. */
  static fail<E>(error: E): Stream<never, never, E> {
    return Stream.fromEither(Left.of(error));
  }

  /** No items, ends with `end`: a Right succeeds, a Left fails. */
  static fromEither<R, E>(end: Either<R, E>): Stream<never, R, E> {
    return Stream.make((sink) => sink.end(end));
  }

  /** The successful items, in order, then the end. */
  static fromIterable<T>(items: Iterable<T>): Stream<T, void, never> {
    return Stream.make((sink) => {
      for (const item of items) {
        sink.next(Right.of(item));
      }
      sink.end(Right.of(undefined));
    });
  }

  /**
   * A stream from a computation that cannot fail by itself. What it throws is turned into a
   * failure by `from`, and by `map` and `flatMap`, whose types include Error. Enforces the grammar:
   * nothing after the end, nothing after a cancel, one end.
   */
  private static make<T, R, E>(computation: StreamComputation<T, R, E>): Stream<T, R, E> {
    return new Stream((observer) => {
      let finished = false;
      // What an observer threw: it is the observer's bug, not the stream's failure.
      let observerFailure: { readonly error: unknown } | undefined;
      const callObserver = (call: () => void) => {
        try {
          call();
        } catch (error) {
          observerFailure = { error };
          throw error;
        }
      };
      const sink: StreamSink<T, R, E> = {
        next: (item) => {
          if (!finished) {
            callObserver(() => observer.next?.(item));
          }
        },
        end: (result) => {
          if (!finished) {
            finished = true;
            callObserver(() => observer.end?.(result));
          }
        },
      };
      let cancel: Cancel | void;
      try {
        cancel = computation(sink);
      } catch (reason) {
        if (finished || observerFailure?.error === reason) {
          // Not the source's failure: an observer threw, and it comes back up through the source.
          throw reason;
        }
        sink.end(Left.of(toError(reason)) as Either<R, E>);
      }
      return () => {
        if (!finished) {
          finished = true;
          cancel?.();
        }
      };
    });
  }

  /** Map what the stream ends with. Items and a failure pass through. A throw fails the stream. */
  [MAP]<U>(f: (result: R) => U): Stream<T, U, E | Error> {
    return Stream.make<T, U, E | Error>((sink) =>
      subscribe(this, {
        next: (item) => sink.next(item),
        end: (result) => sink.end(match<R, E, Either<U, E | Error>>(result, {
          Right: (value) => attemptAsError(() => f(value)),
          Left: (error) => Left.of(error),
        })),
      }));
  }

  /**
   * Chain another stream (the monad's bind): run this one, delivering its items; when it ends with
   * a Right `r`, run `f(r)`, delivering its items, and end with its end. If it ends with a Left,
   * `f` never runs. A throw in `f` ends the stream with a failure. Cancelling cancels whichever
   * stream is running.
   */
  [CHAIN]<T2, R2, F>(f: (result: R) => Stream<T2, R2, F>): Stream<T | T2, R2, E | F | Error> {
    return Stream.make<T | T2, R2, E | F | Error>((sink) => {
      let cancelSecond: Cancel | undefined;
      const cancelFirst = subscribe(this, {
        next: (item) => sink.next(item),
        end: (result) => {
          // Pure up to here: the next stream, or the failure that replaces the end.
          const next = flatMap(result, (value) => attemptAsError(() => f(value)));
          use(next, {
            Left: (error) => sink.end(Left.of(error)),
            Right: (stream) => {
              cancelSecond = subscribe(stream, {
                next: (item) => sink.next(item),
                end: (end) => sink.end(end),
              });
            },
          });
        },
      });
      return () => (cancelSecond ?? cancelFirst)();
    });
  }
}

/** `f()` as an Either: a Right of its result, or a Left of what it threw, as an Error. */
const attemptAsError = <U>(f: () => U): Either<U, Error> =>
  mapLeftEither(attempt(f, (error): error is Error => true), toError);

/**
 * Start the stream (each call is a new run) and tell `observer` its items and its end. Returns how
 * to cancel, after which nothing more is delivered.
 */
export function subscribe<T, R, E>(
  stream: Stream<T, R, E>,
  observer: StreamObserver<T, R, E> = {},
): Cancel {
  const start = starts.get(stream) as Start<T, R, E>;
  return start(observer);
}

/**
 * Subscribe with the values unwrapped: successful items to `next`, a successful end to `ok`, any
 * failure to `error`, which, when absent, is re-thrown where it happens.
 */
export function run<T, R, E>(
  stream: Stream<T, R, E>,
  handlers: StreamHandlers<T, R, E> = {},
): Cancel {
  // Without an error handler a failure is re-thrown where it happens (see StreamHandlers).
  const fail = (error: E) => {
    if (!handlers.error) {
      throw error;
    }
    handlers.error(error);
  };
  return subscribe(stream, {
    next: (item) => use(item, { Left: fail, Right: (value) => handlers.next?.(value) }),
    end: (result) => use(result, { Left: fail, Right: (value) => handlers.ok?.(value) }),
  });
}

/** Transform the errors, of the items and of the end. Successes pass through. */
export function mapErrors<T, R, E, F>(stream: Stream<T, R, E>, f: (error: E) => F): Stream<T, R, F>;
export function mapErrors<E, F>(
  f: (error: E) => F,
): <T, R>(stream: Stream<T, R, E>) => Stream<T, R, F>;
export function mapErrors(...args: readonly unknown[]): unknown {
  if (args.length === 1) {
    const [f] = args as [(error: unknown) => unknown];
    return (stream: Stream<unknown, unknown, unknown>) => mapErrors(stream, f);
  }
  const [stream, f] = args as [Stream<unknown, unknown, unknown>, (error: unknown) => unknown];
  return Stream.from<unknown, unknown, unknown>((sink) =>
    subscribe(stream, {
      next: (item) => sink.next(mapLeftEither(item, f)),
      end: (result) => sink.end(mapLeftEither(result, f)),
    })) as Stream<unknown, unknown, unknown>;
}

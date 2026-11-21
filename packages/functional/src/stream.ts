// Stream<T, R, E>: many values, later. The many-valued sibling of Task.
//
// A stream delivers items, then ends:
//
//   item* end
//
// - An item is an `Either<T, E>`: a failure is a value, and it does NOT end
//   the stream. Only two things end a subscription: the source ending the
//   stream, or the subscriber cancelling.
// - The end is an `Either<R, E>` too: `R` is what the stream ends with
//   (`void` for most), or `Left` when it ended because it failed. After it,
//   nothing more is delivered.
// - Cancelling is silent: after it, no item and no end arrives.
//
// Like Maybe, Either and Task it is a monad with the same vocabulary, and
// the monad is on the END, not on the items (as in Haskell's `streaming`):
//   Stream.end(r)       no items, ends with `r`
//   Stream.map(s, f)    transform what it ends with, or Stream.map(f) in a pipe
//   Stream.flatMap(s, f)  run this stream, then the one `f` makes from its end
//
// So a Task is the special case of a stream with no items: it only ends, with
// its outcome. Failures short-circuit, as in Either: if this stream ends
// with a `Left`, `f` never runs.
//
// Streams are cold: nothing happens until `subscribe`, and each subscriber
// starts its own run. A hot source (values happen whether or not anyone
// listens) is an Emitter, which hands out a Stream to subscribe to.
//
//   const upload = Stream.from<number, Response>((sink) => { ... });
//   upload.run({ next: showProgress, ok: showResult, error: showError });

import { Either, toError } from "./either.ts";
import { dual } from "./dual.ts";

/** `Stream.map`: data-first `map(s, f)`, or data-last `map(f)` for `pipe`. */
export interface StreamMap {
  <T, R, E, R2>(self: Stream<T, R, E>, f: (result: R) => R2): Stream<T, R2, E | Error>;
  <R, R2>(f: (result: R) => R2): <T, E>(self: Stream<T, R, E>) => Stream<T, R2, E | Error>;
}

/** `Stream.flatMap`: data-first `flatMap(s, f)`, or data-last `flatMap(f)` for `pipe`. */
export interface StreamFlatMap {
  <T, R, E, T2, R2, F>(
    self: Stream<T, R, E>,
    f: (result: R) => Stream<T2, R2, F>,
  ): Stream<T | T2, R2, E | F | Error>;
  <R, T2, R2, F>(
    f: (result: R) => Stream<T2, R2, F>,
  ): <T, E>(self: Stream<T, R, E>) => Stream<T | T2, R2, E | F | Error>;
}

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
 * How a stream does its work: deliver items and end through `sink` (now, or
 * later), and return how to cancel, if it can be cancelled.
 */
export type StreamComputation<T, R, E> = (sink: StreamSink<T, R, E>) => Cancel | void;

/** What a subscriber is told. Both parts are optional. */
export interface StreamObserver<T, R, E> {
  readonly next?: (item: Either<T, E>) => void;
  readonly end?: (result: Either<R, E>) => void;
}

/** What to do with a stream's values, unwrapped: see `Stream.run`. */
export interface StreamHandlers<T, R, E> {
  /** Each successful item. */
  readonly next?: (value: T) => void;
  /** The end, if it succeeded. */
  readonly ok?: (result: R) => void;
  /**
   * Any failure, of an item or of the end. Without it, a failure is
   * re-thrown where it happens, so it is never silently lost.
   */
  readonly error?: (error: E) => void;
}

export class Stream<T, R = void, E = Error> {
  static readonly map: StreamMap = dual<StreamMap>(
    2,
    (self: Stream<unknown, unknown, unknown>, f: (result: unknown) => unknown) => self.map(f),
  );

  static readonly flatMap: StreamFlatMap = dual<StreamFlatMap>(
    2,
    (
      self: Stream<unknown, unknown, unknown>,
      f: (result: unknown) => Stream<unknown, unknown, unknown>,
    ) => self.flatMap(f),
  );

  private constructor(private readonly start: (observer: StreamObserver<T, R, E>) => Cancel) {}

  /**
   * A stream doing `computation` each time it is subscribed to. An
   * exception the computation throws becomes a failure: the stream ends
   * with a `Left` holding an Error (so `E | Error`: any effect can fail).
   */
  static from<T, R = void, E = Error>(
    computation: StreamComputation<T, R, E>,
  ): Stream<T, R, E | Error> {
    return Stream.make(computation) as Stream<T, R, E | Error>;
  }

  /**
   * A hot stream: `subscribe` registers an observer and returns how to
   * remove it. The source must keep the grammar itself (items, then one
   * end, and nothing after a cancel); see Emitter, which does.
   */
  static hot<T, R, E>(
    subscribe: (observer: StreamObserver<T, R, E>) => Cancel,
  ): Stream<T, R, E> {
    return new Stream(subscribe);
  }

  /** No items, ends with `result`. */
  static end<R>(result: R): Stream<never, R, never> {
    return Stream.fromEither(Either.right(result));
  }

  /** No items, ends with the failure `error`. */
  static fail<E>(error: E): Stream<never, never, E> {
    return Stream.fromEither(Either.left(error));
  }

  /** No items, ends with `end`: a Right succeeds, a Left fails. */
  static fromEither<E, R>(end: Either<R, E>): Stream<never, R, E> {
    return Stream.make((sink) => sink.end(end));
  }

  /** The successful items `items`, in order, then the end. */
  static fromIterable<T>(items: Iterable<T>): Stream<T, void, never> {
    return Stream.make((sink) => {
      for (const item of items) {
        sink.next(Either.right(item));
      }
      sink.end(Either.right(undefined));
    });
  }

  /**
   * A cold stream from a computation that cannot fail by itself (internal:
   * what throws is turned into a failure only by `from`, `map` and `flatMap`,
   * whose types include Error). Enforces the grammar: nothing after the end,
   * nothing after a cancel, one end.
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
          // Not the source's failure: an observer threw, and it comes back up
          // through the source. It must not be swallowed.
          throw reason;
        }
        sink.end(Either.left(toError(reason)) as Either<R, E>);
      }
      return () => {
        if (!finished) {
          finished = true;
          cancel?.();
        }
      };
    });
  }

  /**
   * Start the stream (each call is a new run) and tell `observer` its items
   * and its end. Returns how to cancel, after which nothing more is delivered.
   */
  subscribe(observer: StreamObserver<T, R, E> = {}): Cancel {
    return this.start(observer);
  }

  /**
   * Subscribe with the values unwrapped: successful items to `next`, a
   * successful end to `ok`, any failure to `error`, which, when absent,
   * is re-thrown where it happens.
   */
  run(handlers: StreamHandlers<T, R, E> = {}): Cancel {
    const fail = (error: E) => {
      if (!handlers.error) {
        throw error;
      }
      handlers.error(error);
    };
    return this.subscribe({
      next: (item) => item.match({ left: fail, right: (value) => handlers.next?.(value) }),
      end: (result) => result.match({ left: fail, right: (value) => handlers.ok?.(value) }),
    });
  }

  /**
   * Transform what the stream ends with; items, and a failure, pass through.
   * An exception thrown by `f` ends the stream with a failure.
   */
  private map<R2>(f: (result: R) => R2): Stream<T, R2, E | Error> {
    return Stream.make<T, R2, E | Error>((sink) =>
      this.subscribe({
        next: (item) => sink.next(item),
        end: (result) =>
          sink.end(Either.flatMap(result, (value) => Either.tryCatch(() => f(value))
            .mapLeft(toError))),
      }));
  }

  /** Transform the errors, of the items and of the end; successes pass through. */
  mapLeft<F>(f: (error: E) => F): Stream<T, R, F> {
    return Stream.make<T, R, F>((sink) =>
      this.subscribe({
        next: (item) => sink.next(item.mapLeft(f)),
        end: (result) => sink.end(result.mapLeft(f)),
      }));
  }

  /**
   * Chain another stream (the monad's bind): run this one, delivering its
   * items; when it ends successfully with `r`, run `f(r)`, delivering its
   * items, and end with its end. If this one ends with a failure, `f` never
   * runs. An exception thrown by `f` ends the stream with a failure.
   * Cancelling cancels whichever stream is running.
   */
  private flatMap<T2, R2, F>(
    f: (result: R) => Stream<T2, R2, F>,
  ): Stream<T | T2, R2, E | F | Error> {
    return Stream.make<T | T2, R2, E | F | Error>((sink) => {
      // The step running now: this stream, then the one `f` returned.
      let cancelSecond: Cancel | undefined;
      const cancelFirst = this.subscribe({
        next: (item) => sink.next(item),
        end: (result) => result.match({
          left: (error) => sink.end(Either.left(error)),
          right: (value) => Either.tryCatch(() => f(value))
            .mapLeft(toError)
            .match({
              left: (error) => sink.end(Either.left(error)),
              right: (next) => {
                cancelSecond = next.subscribe({
                  next: (item) => sink.next(item),
                  end: (end) => sink.end(end),
                });
              },
            }),
        }),
      });
      return () => (cancelSecond ?? cancelFirst)();
    });
  }
}

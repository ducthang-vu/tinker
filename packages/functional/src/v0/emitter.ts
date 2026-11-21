// Emitter<T, R, E>: a hot source for a Stream. Values happen whether or not
// anyone listens (a click, an output of a directive); subscribers just
// listen from the moment they subscribe.
//
//   const selected = Emitter.create<ItemId>();
//   selected.stream.run({ next: (id) => select(id) });   // what others get
//   selected.emit(id);                                   // what the owner does
//
// The owner holds the emitter and can emit and end it; what it hands out is
// only `stream`, which can be subscribed to. So only the owner decides what
// is emitted and when it ends.
//
// - Items go to the subscribers in the order they subscribed, each in the
//   order they were emitted: emitting from inside a listener is queued until
//   the current value has reached everyone, so no listener sees the values
//   out of order.
// - The end is remembered: a subscriber arriving after the end is told it
//   at once. After the end, `emit` does nothing.
// - Cancelling is silent, and takes effect immediately: a listener cancelled
//   by an earlier listener of the same delivery is not called.
// - An exception thrown by a listener is the listener's bug, not the stream's
//   failure: the other listeners still run, and it is reported (see
//   internal/unhandled.ts) instead of thrown into `emit()`, so a bug in a
//   listener never breaks the code that emits.

import { Either } from "./either.ts";
import { reportUnhandled } from "./internal/unhandled.ts";
import { Maybe } from "./maybe.ts";
import { type Cancel, Stream, type StreamObserver } from "./stream.ts";

/** One subscriber, and whether it is still listening. */
interface Subscription<T, R, E> {
  readonly observer: StreamObserver<T, R, E>;
  active: boolean;
}

/** What waits in the queue: an item, or the end. */
type Event<T, R, E>
  = | { readonly kind: "item"; readonly item: Either<T, E> }
    | { readonly kind: "end"; readonly result: Either<R, E> };

export class Emitter<T, R = void, E = never> {
  /** What the owner hands out: subscribe to it, but not emit or end. */
  readonly stream: Stream<T, R, E>;

  private readonly subscriptions = new Set<Subscription<T, R, E>>();
  private readonly queue: Event<T, R, E>[] = [];
  private delivering = false;
  /** Set when the end is emitted: anything emitted after it is ignored. */
  private ended = false;
  /** Set when the end reached the subscribers: later subscribers get it at once. */
  private final = Maybe.none<Either<R, E>>();

  private constructor() {
    this.stream = Stream.hot((observer) => this.subscribe(observer));
  }

  static create<T, R = void, E = never>(): Emitter<T, R, E> {
    return new Emitter();
  }

  /** Emit a successful item. */
  emit(value: T): void {
    this.enqueue({ kind: "item", item: Either.right(value) });
  }

  /** Emit a failure as an item: the stream goes on. */
  emitError(error: E): void {
    this.enqueue({ kind: "item", item: Either.left(error) });
  }

  /** End the stream successfully, with `result`. */
  complete(result: R): void {
    this.enqueue({ kind: "end", result: Either.right(result) });
  }

  /** End the stream with a failure: it will not go on. */
  fail(error: E): void {
    this.enqueue({ kind: "end", result: Either.left(error) });
  }

  private subscribe(observer: StreamObserver<T, R, E>): Cancel {
    return this.final.match({
      some: (result) => {
        // Already over: tell it, as if it had been there.
        this.call(() => observer.end?.(result));
        return () => {};
      },
      none: () => {
        const subscription = { observer, active: true };
        this.subscriptions.add(subscription);
        return () => {
          subscription.active = false;
          this.subscriptions.delete(subscription);
        };
      },
    });
  }

  private enqueue(event: Event<T, R, E>): void {
    if (this.ended) {
      return;
    }
    if (event.kind === "end") {
      this.ended = true;
    }
    this.queue.push(event);
    if (this.delivering) {
      return; // the delivery in progress takes it next, in order
    }
    this.delivering = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) {
        this.deliver(next);
      }
    } finally {
      this.delivering = false;
    }
  }

  private deliver(event: Event<T, R, E>): void {
    if (event.kind === "end") {
      this.final = Maybe.some(event.result);
    }
    // A snapshot: who subscribes during this delivery waits for the next event.
    for (const subscription of [...this.subscriptions]) {
      if (!subscription.active) {
        continue; // cancelled by an earlier listener of this same delivery
      }
      if (event.kind === "end") {
        subscription.active = false;
        this.call(() => subscription.observer.end?.(event.result));
      } else {
        this.call(() => subscription.observer.next?.(event.item));
      }
    }
    if (event.kind === "end") {
      this.subscriptions.clear();
    }
  }

  /** Call a listener: what it throws is reported, and does not reach the others or the owner. */
  private call(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      reportUnhandled(error);
    }
  }
}

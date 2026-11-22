// Emitter<T, R, E>: the owner's side of a hot stream. Values happen whether or not anyone listens
// (a click, an output of a directive); subscribers listen from the moment they subscribe.
//
//   const selected = Emitter.create<ItemId>();
//   run(selected.stream, { next: (id) => select(id) });   // what others get
//   selected.emit(id);                                    // what the owner does
//
// The owner holds the emitter and can emit and end it. What it hands out is only `stream`, which
// can be subscribed to, so only the owner decides what is emitted and when it ends.
//
// - Items reach the subscribers in the order they subscribed, each in the order they were emitted.
//   Emitting from inside a listener is queued until the current value has reached everyone, so no
//   listener sees the values out of order.
// - The end is remembered: a subscriber arriving after it is told at once. After the end, `emit`
//   does nothing.
// - Cancelling is silent and takes effect immediately: a listener cancelled by an earlier listener
//   of the same delivery is not called.
// - An exception thrown by a listener is the listener's bug, not the stream's failure. The other
//   listeners still run, and it is reported (see unhandled.ts) rather than thrown into `emit`.

import { Right, Left, type Either } from "./either.ts";
import { None, Some, type Maybe } from "./maybe.ts";
import { match } from "./monad.ts";
import { reportUnhandled } from "./unhandled.ts";
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

/**
 * A hot source for a stream. Create one with `Emitter.create`, hand out `stream`, and emit into it.
 *
 * @example
 * ```ts
 * import { Emitter, run } from "@tinker/functional/v1";
 *
 * const selected = Emitter.create<number>();
 * run(selected.stream, { next: (id) => console.log(id) });
 * selected.emit(7);
 * ```
 */
export class Emitter<T, R = void, E = never> {
  /** What the owner hands out: subscribe to it, but not emit or end it. */
  readonly stream: Stream<T, R, E>;

  private readonly subscriptions = new Set<Subscription<T, R, E>>();
  private readonly queue: Event<T, R, E>[] = [];
  private delivering = false;
  /** Set when the end is emitted: anything emitted after it is ignored. */
  private ended = false;
  /** Set when the end reached the subscribers: later subscribers get it at once. */
  private final: Maybe<Either<R, E>> = None.of();

  private constructor() {
    this.stream = Stream.hot((observer) => this.subscribe(observer));
  }

  /** A new emitter with no subscribers. */
  static create<T, R = void, E = never>(): Emitter<T, R, E> {
    return new Emitter<T, R, E>();
  }

  /** Emit a successful item. */
  emit(value: T): void {
    this.enqueue({ kind: "item", item: Right.of(value) });
  }

  /** Emit a failure as an item: the stream goes on. */
  emitError(error: E): void {
    this.enqueue({ kind: "item", item: Left.of(error) });
  }

  /** End the stream successfully, with `result`. */
  complete(result: R): void {
    this.enqueue({ kind: "end", result: Right.of(result) });
  }

  /** End the stream with a failure: it will not go on. */
  fail(error: E): void {
    this.enqueue({ kind: "end", result: Left.of(error) });
  }

  private subscribe(observer: StreamObserver<T, R, E>): Cancel {
    const over = match(this.final, {
      Some: (result) => ({ result }),
      None: () => undefined,
    });
    if (over !== undefined) {
      // Already over: tell it, as if it had been there.
      this.call(() => observer.end?.(over.result));
      return () => {};
    }
    const subscription: Subscription<T, R, E> = { observer, active: true };
    this.subscriptions.add(subscription);
    return () => {
      subscription.active = false;
      this.subscriptions.delete(subscription);
    };
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
      this.final = Some.of(event.result);
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

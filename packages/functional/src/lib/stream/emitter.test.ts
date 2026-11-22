import { describe, expect, test } from "vitest";
import { Left, Right, type Either } from "../monad/either.ts";
import { match } from "../monad/monad.ts";
import { Emitter } from "./emitter.ts";
import { subscribe, run } from "./stream.ts";
import { withUnhandledReporter } from "./unhandled.ts";

/** A readable label for an item: `ok 1` or `fail bad`. */
const show = (item: Either<unknown, unknown>): string =>
  match(item, { Right: (value) => `ok ${String(value)}`, Left: (error) => `fail ${String(error)}` });

describe("delivery", () => {
  test("items reach subscribers in subscription order, each in emission order", () => {
    const emitter = Emitter.create<number>();
    const seen: string[] = [];
    subscribe(emitter.stream, { next: (item) => seen.push(`a ${show(item)}`) });
    subscribe(emitter.stream, { next: (item) => seen.push(`b ${show(item)}`) });
    emitter.emit(1);
    emitter.emit(2);
    expect(seen)
      .toEqual([`a ok 1`, `b ok 1`,
        `a ok 2`, `b ok 2`]);
  });

  test("a subscriber only hears items emitted after it subscribed", () => {
    const emitter = Emitter.create<number>();
    emitter.emit(1);
    const seen: unknown[] = [];
    subscribe(emitter.stream, { next: (item) => seen.push(item) });
    emitter.emit(2);
    expect(seen)
      .toEqual([Right.of(2)]);
  });

  test("emitting from inside a listener is queued, so no listener sees values out of order", () => {
    const emitter = Emitter.create<number>();
    const seen: string[] = [];
    let emitted = false;
    subscribe(emitter.stream, {
      next: (item) => {
        seen.push(`first ${show(item)}`);
        if (!emitted) {
          emitted = true;
          emitter.emit(2);
        }
      },
    });
    subscribe(emitter.stream, { next: (item) => seen.push(`second ${show(item)}`) });
    emitter.emit(1);
    expect(seen)
      .toEqual([`first ok 1`, `second ok 1`,
        `first ok 2`, `second ok 2`]);
  });

  test("a failed item goes on to the subscribers, and the stream does not end", () => {
    const emitter = Emitter.create<number, void, string>();
    const seen: unknown[] = [];
    subscribe(emitter.stream, { next: (item) => seen.push(item) });
    emitter.emitError("bad");
    emitter.emit(3);
    expect(seen)
      .toEqual([Left.of("bad"), Right.of(3)]);
  });
});

describe("the end", () => {
  test("complete ends the subscribers with its result", () => {
    const emitter = Emitter.create<number, string>();
    const ends: unknown[] = [];
    subscribe(emitter.stream, { end: (result) => ends.push(result) });
    emitter.complete("done");
    expect(ends)
      .toEqual([Right.of("done")]);
  });

  test("fail ends the subscribers with a failure", () => {
    const emitter = Emitter.create<number, string, string>();
    const ends: unknown[] = [];
    subscribe(emitter.stream, { end: (result) => ends.push(result) });
    emitter.fail("gone");
    expect(ends)
      .toEqual([Left.of("gone")]);
  });

  test("a subscriber arriving after the end is told at once", () => {
    const emitter = Emitter.create<number, string>();
    emitter.complete("done");
    const ends: unknown[] = [];
    const cancel = subscribe(emitter.stream, { end: (result) => ends.push(result) });
    expect(ends)
      .toEqual([Right.of("done")]);
    expect(() => cancel())
      .not.toThrow();
  });

  test("a late subscriber with no end handler is not called", () => {
    const emitter = Emitter.create<number>();
    emitter.complete(undefined);
    expect(() => subscribe(emitter.stream, {}))
      .not.toThrow();
  });

  test("after the end, emit, emitError, complete and fail do nothing", () => {
    const emitter = Emitter.create<number, string, string>();
    const seen: unknown[] = [];
    subscribe(emitter.stream, { next: (item) => seen.push(item), end: (r) => seen.push(r) });
    emitter.complete("done");
    emitter.emit(1);
    emitter.emitError("bad");
    emitter.complete("again");
    emitter.fail("later");
    expect(seen)
      .toEqual([Right.of("done")]);
  });

  test("a subscriber with no end handler still hears the items, and the end is ignored", () => {
    const emitter = Emitter.create<number>();
    const seen: unknown[] = [];
    subscribe(emitter.stream, { next: (item) => seen.push(item) });
    emitter.emit(1);
    emitter.complete(undefined);
    expect(seen)
      .toEqual([Right.of(1)]);
  });

  test("an end emitted from inside a listener is delivered after the current item", () => {
    const emitter = Emitter.create<number, string>();
    const seen: string[] = [];
    subscribe(emitter.stream, {
      next: () => {
        seen.push("item");
        emitter.complete("done");
      },
      end: () => seen.push("end"),
    });
    emitter.emit(1);
    expect(seen)
      .toEqual(["item", "end"]);
  });
});

describe("cancelling", () => {
  test("a cancelled subscriber hears nothing more", () => {
    const emitter = Emitter.create<number>();
    const seen: unknown[] = [];
    const cancel = subscribe(emitter.stream, { next: (item) => seen.push(item) });
    emitter.emit(1);
    cancel();
    emitter.emit(2);
    expect(seen)
      .toEqual([Right.of(1)]);
  });

  test("cancelling twice is harmless", () => {
    const emitter = Emitter.create<number>();
    const cancel = subscribe(emitter.stream, {});
    cancel();
    expect(() => cancel())
      .not.toThrow();
  });

  test("a listener cancelled by an earlier listener of the same delivery is not called", () => {
    const emitter = Emitter.create<number>();
    const seen: string[] = [];
    let cancelSecond = (): void => {};
    subscribe(emitter.stream, {
      next: () => {
        seen.push("first");
        cancelSecond();
      },
    });
    cancelSecond = subscribe(emitter.stream, { next: () => seen.push("second") });
    emitter.emit(1);
    expect(seen)
      .toEqual(["first"]);
  });
});

describe("a listener that throws", () => {
  test("the exception is reported, the other listeners still run, and emit does not throw", () => {
    const emitter = Emitter.create<number>();
    const reported: unknown[] = [];
    const seen: string[] = [];
    subscribe(emitter.stream, {
      next: () => {
        throw new Error("listener bug");
      },
    });
    subscribe(emitter.stream, { next: () => seen.push("other") });
    withUnhandledReporter((error) => reported.push(error), () => {
      expect(() => emitter.emit(1))
        .not.toThrow();
    });
    expect(seen)
      .toEqual(["other"]);
    expect(reported)
      .toEqual([new Error("listener bug")]);
  });

  test("an end listener that throws is reported too", () => {
    const emitter = Emitter.create<number, string>();
    const reported: unknown[] = [];
    subscribe(emitter.stream, {
      end: () => {
        throw new Error("end bug");
      },
    });
    withUnhandledReporter((error) => reported.push(error), () => emitter.complete("done"));
    expect(reported)
      .toEqual([new Error("end bug")]);
  });

  test("a late subscriber whose end handler throws is reported, and subscribing does not throw", () => {
    const emitter = Emitter.create<number, string>();
    emitter.complete("done");
    const reported: unknown[] = [];
    withUnhandledReporter((error) => reported.push(error), () => {
      expect(() => subscribe(emitter.stream, {
        end: () => {
          throw new Error("late bug");
        },
      }))
        .not.toThrow();
    });
    expect(reported)
      .toEqual([new Error("late bug")]);
  });
});

describe("run on the stream", () => {
  test("run unwraps the values the owner emits", () => {
    const emitter = Emitter.create<number, string, string>();
    const values: number[] = [];
    const failures: string[] = [];
    run(emitter.stream, {
      next: (value) => values.push(value),
      error: (error) => failures.push(error),
    });
    emitter.emit(1);
    emitter.emitError("bad");
    expect(values)
      .toEqual([1]);
    expect(failures)
      .toEqual(["bad"]);
  });
});

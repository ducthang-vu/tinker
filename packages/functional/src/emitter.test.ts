import { describe, expect, test } from "vitest";
import { Emitter } from "./emitter.ts";
import type { Either } from "./either.ts";
import { withUnhandledReporter } from "./internal/unhandled.ts";
import type { Stream } from "./stream.ts";

const show = (either: Either<unknown, unknown>): ["left" | "right", unknown] => either.match<
  ["left" | "right", unknown]
>({
  left: (error) => ["left", error],
  right: (value) => ["right", value],
});

/** Subscribe, recording what is delivered under `name`. */
function listen<T, R, E>(stream: Stream<T, R, E>, log: unknown[], name = "a") {
  return stream.subscribe({
    next: (item) => log.push([name, "item", ...show(item)]),
    end: (result) => log.push([name, "end", ...show(result)]),
  });
}

describe("Emitter", () => {
  test("the owner emits successes and failures as items; the stream goes on", () => {
    const emitter = Emitter.create<number, void, string>();
    const log: unknown[] = [];
    listen(emitter.stream, log);
    emitter.emit(1);
    emitter.emitError("not this one");
    emitter.emit(2);
    expect(log)
      .toEqual([["a", "item", "right", 1], ["a", "item", "left", "not this one"], ["a", "item", "right", 2]]);
  });

  test("the end is complete (a result) or fail (a failure); nothing is delivered after it", () => {
    const done = Emitter.create<number, string>();
    const log: unknown[] = [];
    listen(done.stream, log);
    done.emit(1);
    done.complete("finished");
    done.emit(2);
    done.complete("again");
    done.fail(undefined as never);
    expect(log)
      .toEqual([["a", "item", "right", 1], ["a", "end", "right", "finished"]]);

    const failed = Emitter.create<number, void, string>();
    const failLog: unknown[] = [];
    listen(failed.stream, failLog);
    failed.fail("broke");
    expect(failLog)
      .toEqual([["a", "end", "left", "broke"]]);
  });

  test("is hot: a subscriber hears only what is emitted after it subscribed", () => {
    const emitter = Emitter.create<number>();
    const log: unknown[] = [];
    emitter.emit(1); // nobody listening
    listen(emitter.stream, log);
    emitter.emit(2);
    expect(log)
      .toEqual([["a", "item", "right", 2]]);
  });

  test("subscribers are called in the order they subscribed, each value reaching all before the next", () => {
    const emitter = Emitter.create<number>();
    const log: unknown[] = [];
    listen(emitter.stream, log, "first");
    listen(emitter.stream, log, "second");
    emitter.emit(1);
    emitter.emit(2);
    expect(log.map((entry) => (entry as unknown[]).join(":")))
      .toEqual(["first:item:right:1", "second:item:right:1", "first:item:right:2", "second:item:right:2"]);
  });

  test("the end is remembered: a late subscriber is told it at once, and cancelling it does nothing", () => {
    const emitter = Emitter.create<number, string, string>();
    emitter.complete("over");
    const log: unknown[] = [];
    const cancel = listen(emitter.stream, log);
    expect(log)
      .toEqual([["a", "end", "right", "over"]]);
    expect(() => cancel())
      .not.toThrow();

    const failed = Emitter.create<number, void, string>();
    failed.fail("broke");
    const failedLog: unknown[] = [];
    listen(failed.stream, failedLog);
    expect(failedLog)
      .toEqual([["a", "end", "left", "broke"]]);
  });

  test("cancelling is silent, and takes effect at once: even for a listener of the same delivery", () => {
    const emitter = Emitter.create<number>();
    const log: unknown[] = [];
    let cancelSecond = () => {};
    listen(emitter.stream, log, "first");
    emitter.stream.subscribe({
      next: () => cancelSecond(), // the first value: cancels the next listener
    });
    cancelSecond = listen(emitter.stream, log, "second");
    const third = listen(emitter.stream, log, "third");
    emitter.emit(1);
    third();
    emitter.emit(2);
    emitter.complete(undefined);
    expect(log.map((entry) => (entry as unknown[]).join(":")))
      .toEqual(["first:item:right:1", "third:item:right:1", "first:item:right:2", "first:end:right:"]);
  });

  test("a subscriber that subscribes during a delivery hears the next value, not the current one", () => {
    const emitter = Emitter.create<number>();
    const log: unknown[] = [];
    let subscribed = false;
    emitter.stream.subscribe({
      next: () => {
        if (!subscribed) {
          subscribed = true;
          listen(emitter.stream, log, "late");
        }
      },
    });
    emitter.emit(1);
    emitter.emit(2);
    expect(log)
      .toEqual([["late", "item", "right", 2]]);
  });

  test("emitting from inside a listener is queued: nobody sees the values out of order", () => {
    const emitter = Emitter.create<number>();
    const log: unknown[] = [];
    emitter.stream.subscribe({
      next: (item) => {
        item.match({
          left: () => {},
          right: (value) => {
            log.push(`first heard ${value}`);
            if (value === 1) {
              emitter.emit(2); // reaches the second listener only after 1 did
            }
          },
        });
      },
    });
    emitter.stream.subscribe({
      next: (item) => item.match({ left: () => {}, right: (value) => log.push(`second heard ${value}`) }),
    });
    emitter.emit(1);
    expect(log)
      .toEqual(["first heard 1", "second heard 1", "first heard 2", "second heard 2"]);
  });

  test("ending from inside a listener: what was emitted before still arrives, what is emitted after does not", () => {
    const emitter = Emitter.create<number, string>();
    const log: unknown[] = [];
    emitter.stream.subscribe({
      next: () => {
        emitter.emit(2);
        emitter.complete("stopped");
        emitter.emit(3); // after the end: ignored
      },
    });
    listen(emitter.stream, log);
    emitter.emit(1);
    expect(log)
      .toEqual([["a", "item", "right", 1], ["a", "item", "right", 2], ["a", "end", "right", "stopped"]]);
  });

  test("a listener may have only next, or only end", () => {
    const emitter = Emitter.create<number>();
    const seen: unknown[] = [];
    emitter.stream.subscribe({ next: (item) => seen.push(show(item)) });
    emitter.stream.subscribe({ end: (result) => seen.push(["end", ...show(result)]) });
    emitter.stream.subscribe();
    emitter.emit(1);
    emitter.complete(undefined);
    expect(seen)
      .toEqual([["right", 1], ["end", "right", undefined]]);
  });

  describe("a listener that throws", () => {
    test("does not stop the others or break the emitter's owner: the exception is reported", () => {
      const emitter = Emitter.create<number>();
      const log: unknown[] = [];
      const reported: unknown[] = [];
      emitter.stream.subscribe({
        next: () => {
          throw new Error("bug in a listener");
        },
      });
      listen(emitter.stream, log);

      withUnhandledReporter((error) => void reported.push((error as Error).message), () => {
        expect(() => emitter.emit(1))
          .not.toThrow();
        emitter.emit(2);
      });

      expect(log)
        .toEqual([["a", "item", "right", 1], ["a", "item", "right", 2]]);
      expect(reported)
        .toEqual(["bug in a listener", "bug in a listener"]);
    });

    test("is reported when it throws on the end too, or on a late subscription", () => {
      const emitter = Emitter.create<number>();
      const reported: unknown[] = [];
      withUnhandledReporter((error) => void reported.push((error as Error).message), () => {
        emitter.stream.subscribe({
          end: () => {
            throw new Error("in end");
          },
        });
        emitter.complete(undefined);
        emitter.stream.subscribe({
          end: () => {
            throw new Error("in late end");
          },
        });
      });
      expect(reported)
        .toEqual(["in end", "in late end"]);
    });
  });

  test("is usable through run, with the values unwrapped", () => {
    const emitter = Emitter.create<number, string>();
    const seen: unknown[] = [];
    emitter.stream.run({ next: (n) => seen.push(n), ok: (r) => seen.push(r) });
    emitter.emit(1);
    emitter.complete("bye");
    expect(seen)
      .toEqual([1, "bye"]);
  });
});

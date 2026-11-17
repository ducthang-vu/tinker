import { describe, expect, test } from "vitest";
import { Either } from "./either.ts";
import { Stream, type StreamSink } from "./stream.ts";

/** An Either as plain data, to compare. */
const show = (either: Either<unknown, unknown>): ["left" | "right", unknown] => either.match<
  ["left" | "right", unknown]
>({
  left: (error) => ["left", error],
  right: (value) => ["right", value],
});

/** Subscribe and record what is delivered. */
function record<T, R, E>(stream: Stream<T, R, E>) {
  const log: unknown[] = [];
  const cancel = stream.subscribe({
    next: (item) => log.push(["item", ...show(item)]),
    end: (result) => log.push(["end", ...show(result)]),
  });
  return { log, cancel };
}

/** A stream whose sink is driven by the test, to deliver later. */
function manual<T = number, R = void, E = Error>() {
  const control = {
    sink: undefined as unknown as StreamSink<T, R, E>,
    started: 0,
    cancelled: 0,
  };
  const stream = Stream.from<T, R, E>((sink) => {
    control.sink = sink;
    control.started++;
    return () => {
      control.cancelled++;
    };
  });
  return { stream, control };
}

/** Items 1, 2, 3, then ends with "done": a stream with both items and a result. */
const counting = () => Stream.from<number, string, never>((sink) => {
  for (const n of [1, 2, 3]) {
    sink.next(Either.right(n));
  }
  sink.end(Either.right("done"));
});

describe("Stream", () => {
  test("is cold: nothing happens until subscribed, and each subscriber starts its own run", () => {
    let started = 0;
    const stream = Stream.from<number, void, never>((sink) => {
      started++;
      sink.next(Either.right(started));
      sink.end(Either.right(undefined));
    });
    expect(started)
      .toBe(0);
    expect(record(stream).log)
      .toEqual([["item", "right", 1], ["end", "right", undefined]]);
    expect(record(stream).log)
      .toEqual([["item", "right", 2], ["end", "right", undefined]]);
  });

  test("delivers items in order, then the end; nothing after the end", () => {
    const stream = Stream.from<number, string, never>((sink) => {
      sink.next(Either.right(1));
      sink.end(Either.right("done"));
      sink.next(Either.right(2));
      sink.end(Either.right("again"));
    });
    expect(record(stream).log)
      .toEqual([["item", "right", 1], ["end", "right", "done"]]);
  });

  test("a failed item does not end the stream; a failed end does", () => {
    const stream = Stream.from<number, void, string>((sink) => {
      sink.next(Either.right(1));
      sink.next(Either.left("item failed"));
      sink.next(Either.right(2));
      sink.end(Either.left("stream failed"));
      sink.next(Either.right(3));
    });
    expect(record(stream).log)
      .toEqual([
        ["item", "right", 1],
        ["item", "left", "item failed"],
        ["item", "right", 2],
        ["end", "left", "stream failed"],
      ]);
  });

  test("a cancelled subscription is silent: nothing is delivered afterwards, and the source is told", () => {
    const { stream, control } = manual();
    const { log, cancel } = record(stream);
    control.sink.next(Either.right(1));
    cancel();
    control.sink.next(Either.right(2));
    control.sink.end(Either.right(undefined));
    expect(log)
      .toEqual([["item", "right", 1]]);
    expect(control.cancelled)
      .toBe(1);
    cancel(); // again: nothing happens
    expect(control.cancelled)
      .toBe(1);
  });

  test("cancelling after the end, or a source with nothing to cancel, does nothing", () => {
    const finished = record(Stream.end(1));
    expect(() => finished.cancel())
      .not.toThrow();
    const plain = record(Stream.from<number, void, never>(() => {}));
    expect(() => plain.cancel())
      .not.toThrow();
  });

  test("an exception thrown by the source ends the stream with a failure: an Error, or a wrapped value", () => {
    const failing = Stream.from(() => {
      throw new Error("source broke");
    });
    const [kind, side, error] = record(failing).log[0] as [string, string, Error];
    expect([kind, side, error.message])
      .toEqual(["end", "left", "source broke"]);

    const throwingString = Stream.from(() => {
      throw "oops";
    });
    const [, , wrapped] = record(throwingString).log[0] as [string, string, Error];
    expect(wrapped)
      .toBeInstanceOf(Error);
    expect(wrapped.cause)
      .toBe("oops");
  });

  test("an exception thrown after items were delivered still ends the stream with a failure", () => {
    const stream = Stream.from<number>((sink) => {
      sink.next(Either.right(1));
      throw new Error("then it broke");
    });
    const { log } = record(stream);
    expect(log[0])
      .toEqual(["item", "right", 1]);
    expect((log[1] as [string, string, Error])[2].message)
      .toBe("then it broke");
  });

  test("an exception thrown by an observer is the observer's: it is not turned into a failure", () => {
    const stream = Stream.from<number, void, never>((sink) => {
      sink.next(Either.right(1));
      sink.end(Either.right(undefined));
    });
    const ends: unknown[] = [];
    expect(() => stream.subscribe({
      next: () => {
        throw new Error("in next");
      },
      end: (result) => ends.push(result),
    }))
      .toThrow("in next");
    expect(ends)
      .toEqual([]); // not told "the stream failed"
    expect(() => stream.subscribe({
      end: () => {
        throw new Error("in end");
      },
    }))
      .toThrow("in end");
  });

  test("a different exception thrown by the source while handling the observer's is the source's failure", () => {
    const stream = Stream.from<number, void, never>((sink) => {
      try {
        sink.next(Either.right(1));
      } catch {
        throw new Error("the source's own");
      }
    });
    const ends: string[] = [];
    stream.subscribe({
      next: () => {
        throw new Error("the observer's");
      },
      end: (result) => result.match({ left: (e) => ends.push(e.message), right: () => 0 }),
    });
    expect(ends)
      .toEqual(["the source's own"]);
  });

  describe("constructors", () => {
    test("end ends with its value, fail with its failure, from with either", () => {
      expect(record(Stream.end(1)).log)
        .toEqual([["end", "right", 1]]);
      expect(record(Stream.fail("bad")).log)
        .toEqual([["end", "left", "bad"]]);
      expect(record(Stream.fromEither(Either.right("ok"))).log)
        .toEqual([["end", "right", "ok"]]);
      expect(record(Stream.fromEither(Either.left("no"))).log)
        .toEqual([["end", "left", "no"]]);
    });

    test("from delivers the items, then ends", () => {
      expect(record(Stream.fromIterable(new Set([1, 2]))).log)
        .toEqual([["item", "right", 1], ["item", "right", 2], ["end", "right", undefined]]);
      expect(record(Stream.fromIterable([])).log)
        .toEqual([["end", "right", undefined]]);
    });
  });

  describe("run", () => {
    test("unwraps: successful items to next, a successful end to ok", () => {
      const seen: unknown[] = [];
      counting()
        .run({ next: (n) => seen.push(["next", n]), ok: (r) => seen.push(["ok", r]) });
      expect(seen)
        .toEqual([["next", 1], ["next", 2], ["next", 3], ["ok", "done"]]);
    });

    test("sends every failure, of items and of the end, to error", () => {
      const stream = Stream.from<number, void, string>((sink) => {
        sink.next(Either.left("item"));
        sink.end(Either.left("end"));
      });
      const errors: string[] = [];
      stream.run({ error: (e) => errors.push(String(e)) });
      expect(errors)
        .toEqual(["item", "end"]);
    });

    test("without an error handler, a failure is re-thrown where it happens", () => {
      expect(() => Stream.fail(new Error("end failed"))
        .run())
        .toThrow("end failed");
      const itemFails = Stream.from<number, void, Error>((sink) => {
        sink.next(Either.left(new Error("item failed")));
      });
      expect(() => itemFails.run({ next: () => {} }))
        .toThrow("item failed");
    });

    test("every handler is optional", () => {
      expect(() => counting()
        .run())
        .not.toThrow();
    });
  });

  describe("map", () => {
    test("transforms what the stream ends with; items pass through", () => {
      expect(record(counting()
        .map((r) => r.toUpperCase())).log)
        .toEqual([
          ["item", "right", 1],
          ["item", "right", 2],
          ["item", "right", 3],
          ["end", "right", "DONE"],
        ]);
    });

    test("a failure passes through, and f does not run", () => {
      let ran = false;
      const mapped = Stream.fail("bad")
        .map(() => (ran = true));
      expect(record(mapped).log)
        .toEqual([["end", "left", "bad"]]);
      expect(ran)
        .toBe(false);
    });

    test("an exception thrown by f ends the stream with a failure", () => {
      const mapped = Stream.end(1)
        .map(() => {
          throw new Error("f failed");
        });
      expect((record(mapped).log[0] as [string, string, Error])[2].message)
        .toBe("f failed");
    });
  });

  test("mapLeft transforms the errors of items and of the end, not the successes", () => {
    const stream = Stream.from<number, number, string>((sink) => {
      sink.next(Either.right(1));
      sink.next(Either.left("item"));
      sink.end(Either.left("end"));
    });
    expect(record(stream.mapLeft((error) => String(error).length)).log)
      .toEqual([["item", "right", 1], ["item", "left", 4], ["end", "left", 3]]);
    expect(record(Stream.end(2)
      .mapLeft(String)).log)
      .toEqual([["end", "right", 2]]);
  });

  describe("flatMap", () => {
    test("runs the second stream when the first ends, delivering both streams' items in order", () => {
      const chained = counting()
        .flatMap((r) => Stream.from<string, number, never>((sink) => {
          sink.next(Either.right(`after ${r}`));
          sink.end(Either.right(42));
        }));
      expect(record(chained).log)
        .toEqual([
          ["item", "right", 1],
          ["item", "right", 2],
          ["item", "right", 3],
          ["item", "right", "after done"],
          ["end", "right", 42],
        ]);
    });

    test("a failed end short-circuits: f never runs", () => {
      let ran = false;
      const chained = Stream.fail("bad")
        .flatMap(() => {
          ran = true;
          return Stream.end(1);
        });
      expect(record(chained).log)
        .toEqual([["end", "left", "bad"]]);
      expect(ran)
        .toBe(false);
    });

    test("a failed item does not stop the chain", () => {
      const first = Stream.from<number, string, string>((sink) => {
        sink.next(Either.left("item failed"));
        sink.end(Either.right("go on"));
      });
      expect(record(first.flatMap((r) => Stream.end(r.length))).log)
        .toEqual([["item", "left", "item failed"], ["end", "right", 5]]);
    });

    test("an exception thrown by f ends the stream with a failure", () => {
      const chained = Stream.end(1)
        .flatMap(() => {
          throw new Error("f failed");
        });
      expect((record(chained).log[0] as [string, string, Error])[2].message)
        .toBe("f failed");
    });

    test("cancelling cancels whichever stream is running", () => {
      const first = manual<number, string, never>();
      const second = manual<number, string, never>();
      const chained = first.stream.flatMap(() => second.stream);

      const early = record(chained);
      early.cancel();
      expect([first.control.cancelled, second.control.started])
        .toEqual([1, 0]);

      const late = record(chained);
      first.control.sink.end(Either.right("first done"));
      expect(second.control.started)
        .toBe(1);
      late.cancel();
      expect([first.control.cancelled, second.control.cancelled])
        .toEqual([1, 1]); // the first had finished: only the second is cancelled now
    });
  });

  describe("monad laws", () => {
    /** Streams with items and an end, to check the laws against. */
    const f = (r: string) => Stream.from<string, number, never>((sink) => {
      sink.next(Either.right(`${r}!`));
      sink.end(Either.right(r.length));
    });
    const g = (n: number) => Stream.from<string, boolean, never>((sink) => {
      sink.next(Either.right(`n=${n}`));
      sink.end(Either.right(n > 3));
    });
    const failing = Stream.from<number, string, string>((sink) => {
      sink.next(Either.right(0));
      sink.end(Either.left("bad"));
    });

    test("left identity: of(a).flatMap(f) = f(a)", () => {
      expect(record(Stream.end("abc")
        .flatMap(f)).log)
        .toEqual(record(f("abc")).log);
    });

    test("right identity: m.flatMap(of) = m, a failed end included", () => {
      expect(record(counting()
        .flatMap(Stream.end)).log)
        .toEqual(record(counting()).log);
      expect(record(failing.flatMap(Stream.end)).log)
        .toEqual(record(failing).log);
    });

    test("associativity: m.flatMap(f).flatMap(g) = m.flatMap(x => f(x).flatMap(g))", () => {
      expect(record(counting()
        .flatMap(f)
        .flatMap(g)).log)
        .toEqual(record(counting()
          .flatMap((x) => f(x)
            .flatMap(g))).log);
      expect(record(failing.flatMap(f)
        .flatMap(g)).log)
        .toEqual(record(failing.flatMap((x) => f(x)
          .flatMap(g))).log);
    });

    test("map is flatMap with of: m.map(h) = m.flatMap(x => of(h(x)))", () => {
      const h = (r: string) => r.length;
      expect(record(counting()
        .map(h)).log)
        .toEqual(record(counting()
          .flatMap((r) => Stream.end(h(r)))).log);
    });
  });
});

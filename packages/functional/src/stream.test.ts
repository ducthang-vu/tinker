import { describe, expect, test } from "vitest";
import { Left, Right, type Either } from "./either.ts";
import { flatMap, map } from "./functor.ts";
import { mapErrors, run, Stream, subscribe, type StreamObserver } from "./stream.ts";

/** Everything a subscriber is told, in order, as a readable log. */
const log = <T, R, E>(stream: Stream<T, R, E>): string[] => {
  const events: string[] = [];
  subscribe(stream, {
    next: (item) => events.push(`item ${describe1(item)}`),
    end: (result) => events.push(`end ${describe1(result)}`),
  });
  return events;
};

const describe1 = (either: Either<unknown, unknown>): string =>
  Object.is(either.constructor, Right) ? "ok" : "fail";

describe("the grammar: items, then one end", () => {
  test("fromIterable delivers the items in order, then ends with undefined", () => {
    const values: unknown[] = [];
    let ended: unknown;
    subscribe(Stream.fromIterable([1, 2]), {
      next: (item) => values.push((item as Either<unknown, unknown>)),
      end: (result) => {
        ended = result;
      },
    });
    expect(values)
      .toEqual([Right.of(1), Right.of(2)]);
    expect(ended)
      .toEqual(Right.of(undefined));
  });

  test("end delivers its result, and nothing after it", () => {
    const seen: unknown[] = [];
    subscribe(Stream.end("done"), {
      next: (item) => seen.push(["item", item]),
      end: (result) => seen.push(["end", result]),
    });
    expect(seen)
      .toEqual([["end", Right.of("done")]]);
  });

  test("fail ends the stream with a Left, and fromEither ends with the Either it is given", () => {
    const seen: unknown[] = [];
    subscribe(Stream.fail("boom"), { end: (result) => seen.push(result) });
    subscribe(Stream.fromEither(Right.of(3)), { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Left.of("boom"), Right.of(3)]);
  });

  test("a second end is ignored, and so is a late item", () => {
    const stream = Stream.from<number, string>((sink) => {
      sink.end(Right.of("first"));
      sink.end(Right.of("second"));
      sink.next(Right.of(1));
    });
    expect(log(stream))
      .toEqual(["end ok"]);
  });

  test("a failed item does not end the stream", () => {
    const stream = Stream.from<number, void, string>((sink) => {
      sink.next(Left.of("bad"));
      sink.next(Right.of(2));
      sink.end(Right.of(undefined));
    });
    expect(log(stream))
      .toEqual(["item fail", "item ok", "end ok"]);
  });

  test("a hot stream subscribes its source, and cancelling removes the observer", () => {
    const observers: StreamObserver<number, void, never>[] = [];
    const hot = Stream.hot<number, void, never>((observer) => {
      observers.push(observer);
      return () => observers.splice(observers.indexOf(observer), 1);
    });
    const cancel = subscribe(hot, {});
    expect(observers)
      .toHaveLength(1);
    cancel();
    expect(observers)
      .toHaveLength(0);
  });
});

describe("cancelling and failing inside a computation", () => {
  test("cancelling is silent: no item or end arrives after it", () => {
    let emit: ((item: Either<number, never>) => void) | undefined;
    const stream = Stream.from<number, void, never>((sink) => {
      emit = (item) => sink.next(item);
    });
    const seen: unknown[] = [];
    const cancel = subscribe(stream, { next: (item) => seen.push(item) });
    emit?.(Right.of(1));
    cancel();
    emit?.(Right.of(2));
    expect(seen)
      .toEqual([Right.of(1)]);
  });

  test("cancelling runs the computation's cancel function, once", () => {
    let cancelled = 0;
    const stream = Stream.from<number, void, never>(() => () => {
      cancelled += 1;
    });
    const cancel = subscribe(stream, {});
    cancel();
    cancel();
    expect(cancelled)
      .toBe(1);
  });

  test("cancelling after the end does not run the cancel function", () => {
    let cancelled = 0;
    const stream = Stream.from<number, void, never>((sink) => {
      sink.end(Right.of(undefined));
      return () => {
        cancelled += 1;
      };
    });
    subscribe(stream, {})();
    expect(cancelled)
      .toBe(0);
  });

  test("a computation that throws ends the stream with an Error", () => {
    const stream = Stream.from<number, void, string>(() => {
      throw new Error("broke");
    });
    expect(log(stream))
      .toEqual(["end fail"]);
    const seen: unknown[] = [];
    subscribe(stream, { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Left.of(new Error("broke"))]);
  });

  test("a computation that throws a non-Error ends with that value wrapped as an Error", () => {
    const stream = Stream.from<number, void, string>(() => {
      throw "plain";
    });
    const seen: unknown[] = [];
    subscribe(stream, { end: (result) => seen.push(result) });
    expect(seen[0])
      .toEqual(Left.of(new Error("plain")));
  });

  test("an observer that throws is not swallowed by the source", () => {
    const stream = Stream.fromIterable([1]);
    expect(() => subscribe(stream, {
      next: () => {
        throw new Error("observer bug");
      },
    }))
      .toThrow("observer bug");
  });

  test("an observer that throws during the source's end is rethrown too", () => {
    const stream = Stream.end(1);
    expect(() => subscribe(stream, {
      end: () => {
        throw new Error("end bug");
      },
    }))
      .toThrow("end bug");
  });

  test("a finished stream's computation that throws is rethrown, not turned into a failure", () => {
    const stream = Stream.from<number, void, never>((sink) => {
      sink.end(Right.of(undefined));
      throw new Error("after the end");
    });
    expect(() => subscribe(stream, {}))
      .toThrow("after the end");
  });
});

describe("run", () => {
  test("unwraps items to next, a successful end to ok", () => {
    const values: number[] = [];
    const ends: unknown[] = [];
    run(Stream.fromIterable([1, 2]), {
      next: (value) => values.push(value),
      ok: (result) => ends.push(result),
    });
    expect(values)
      .toEqual([1, 2]);
    expect(ends)
      .toEqual([undefined]);
  });

  test("a failure goes to error when given", () => {
    const failures: string[] = [];
    run(Stream.fail("boom"), { error: (error) => failures.push(error) });
    expect(failures)
      .toEqual(["boom"]);
  });

  test("a failure with no error handler is rethrown where it happens", () => {
    expect(() => run(Stream.fail("boom")))
      .toThrow("boom");
  });

  test("items with no next handler are ignored", () => {
    expect(() => run(Stream.fromIterable([1]), {}))
      .not.toThrow();
  });
});

describe("map on the end", () => {
  test("it transforms what the stream ends with", () => {
    const seen: unknown[] = [];
    subscribe(map(Stream.end(2), (n: number) => n * 10), { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Right.of(20)]);
  });

  test("items and a failure pass through unchanged", () => {
    const stream = Stream.from<number, number, string>((sink) => {
      sink.next(Right.of(1));
      sink.end(Left.of("bad"));
    });
    const mapped = map(stream, (n: number) => n + 1);
    expect(log(mapped))
      .toEqual(["item ok", "end fail"]);
  });

  test("a throw in the function ends the stream with a failure", () => {
    const seen: unknown[] = [];
    subscribe(map(Stream.end(1), () => {
      throw new Error("bad map");
    }), { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Left.of(new Error("bad map"))]);
  });

  test("the data-last map applies to a stream", () => {
    const seen: unknown[] = [];
    subscribe(map((n: number) => n + 1)(Stream.end(1)), { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Right.of(2)]);
  });
});

describe("flatMap on the end", () => {
  test("the next stream's items come after this one's, and it ends with its end", () => {
    const first = Stream.from<number, number, never>((sink) => {
      sink.next(Right.of(1));
      sink.end(Right.of(10));
    });
    const chained = flatMap(first, (n: number) => Stream.from<string, string, never>((sink) => {
      sink.next(Right.of(`from ${n}`));
      sink.end(Right.of("done"));
    }));
    expect(log(chained))
      .toEqual(["item ok", "item ok", "end ok"]);
  });

  test("a failed end short-circuits: the function never runs", () => {
    let ran = false;
    const failing = Stream.fail("no");
    const chained = flatMap(failing, () => {
      ran = true;
      return Stream.end(1);
    });
    expect(log(chained))
      .toEqual(["end fail"]);
    expect(ran)
      .toBe(false);
  });

  test("a throw in the function ends the stream with a failure", () => {
    const chained = flatMap(Stream.end(1), () => {
      throw new Error("bad step");
    });
    const seen: unknown[] = [];
    subscribe(chained, { end: (result) => seen.push(result) });
    expect(seen)
      .toEqual([Left.of(new Error("bad step"))]);
  });

  test("cancelling during the second stream cancels that stream", () => {
    let cancelled = false;
    const second = Stream.from<never, void, never>(() => () => {
      cancelled = true;
    });
    const chained = flatMap(Stream.end(1), () => second);
    subscribe(chained, {})();
    expect(cancelled)
      .toBe(true);
  });

  test("cancelling during the first stream cancels that stream", () => {
    let cancelled = false;
    const first = Stream.from<never, number, never>(() => () => {
      cancelled = true;
    });
    const chained = flatMap(first, () => Stream.end(1));
    subscribe(chained, {})();
    expect(cancelled)
      .toBe(true);
  });

  test("the data-last flatMap chains a stream", () => {
    const seen: unknown[] = [];
    subscribe(flatMap((n: number) => Stream.end(n + 1))(Stream.end(1)), {
      end: (result) => seen.push(result),
    });
    expect(seen)
      .toEqual([Right.of(2)]);
  });
});

describe("mapErrors", () => {
  test("it changes the errors of items and of the end, and keeps successes", () => {
    const stream = Stream.from<number, void, string>((sink) => {
      sink.next(Left.of("bad"));
      sink.end(Left.of("gone"));
    });
    expect(log(mapErrors(stream, (error: string) => error.length)))
      .toEqual(["item fail", "end fail"]);
  });

  test("the data-last mapErrors applies to a stream", () => {
    const seen: unknown[] = [];
    const stream = Stream.fail("abc");
    subscribe(mapErrors((error: string) => error.length)(stream), {
      end: (result) => seen.push(result),
    });
    expect(seen)
      .toEqual([Left.of(3)]);
  });
});

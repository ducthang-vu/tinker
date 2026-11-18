// Integration: the functional values working together, through pipe, with no test
// doubles. Each test chains real Maybe, Either, Task, Stream and Emitter values and
// checks what comes out of them, including failures and cancellation.

import { describe, expect, test } from "vitest";
import { Either } from "./either.ts";
import { Emitter } from "./emitter.ts";
import { Maybe } from "./maybe.ts";
import { pipe } from "./pipe.ts";
import { Stream } from "./stream.ts";
import { Task } from "./task.ts";

/** Run `task`, and resolve with the outcome as data: `{ ok }` or `{ error }`. */
function outcome<T, E>(task: Task<T, E>): Promise<{ ok?: T; error?: unknown }> {
  return new Promise((resolve) => {
    task.run({
      ok: (ok) => resolve({ ok }),
      error: (error) => resolve({ error }),
    });
  });
}

/**
 * Record a stream: its items (plain values), its failures, and its end. The
 * handlers are unwrapped, as `Stream.run` gives them.
 */
function record<T, R, E>(stream: Stream<T, R, E>) {
  const items: T[] = [];
  const failures: E[] = [];
  const ends: { ok?: R } = {};
  const stop = stream.run({
    next: (value) => items.push(value),
    ok: (result) => {
      ends.ok = result;
    },
    error: (error) => failures.push(error),
  });
  return { items, failures, ends, stop };
}

describe("Either, Maybe and Task through pipe", () => {
  /** A config is text: parse it, take its port, default it when missing or invalid. */
  const parse = (text: string) => Either.from(() => JSON.parse(text) as { port?: unknown });
  const portOf = (config: { port?: unknown }) => pipe(
    Maybe.from(config.port),
    Maybe.flatMap((port) => (typeof port === "number" ? Maybe.some(port) : Maybe.none<number>())),
    Maybe.map((port) => (port > 0 ? port : 8080)),
  )
    .getOrElse(8080);

  test("a successful parse feeds the port through to a Task that succeeds with it", async () => {
    const port = await outcome(pipe(
      Task.fromEither(parse("{\"port\":3000}")),
      Task.map(portOf),
    ));
    expect(port)
      .toEqual({ ok: 3000 });
  });

  test("a parse failure is a Left, which the Task carries as its failure, not a throw", async () => {
    const result = await outcome(pipe(
      Task.fromEither(parse("{")),
      Task.map(portOf),
    ));
    expect(result.error)
      .toBeInstanceOf(Error);
    expect(result.ok)
      .toBeUndefined();
  });

  test("a missing port falls back to the default through Maybe, without an error", async () => {
    const port = await outcome(pipe(
      Task.fromEither(parse("{}")),
      Task.map(portOf),
    ));
    expect(port)
      .toEqual({ ok: 8080 });
  });

  test("flatMap chains a Task that may fail after one that succeeds", async () => {
    const check = (port: number) => (port < 1024
      ? Task.fail(new Error(`port ${port} is reserved`))
      : Task.succeed(port));
    expect((await outcome(pipe(Task.succeed(80), Task.flatMap(check)))).error)
      .toBeInstanceOf(Error);
    expect(await outcome(pipe(Task.succeed(8080), Task.flatMap(check))))
      .toEqual({ ok: 8080 });
  });
});

describe("an Emitter feeding a Stream", () => {
  test("items pass through unchanged; map and flatMap act on the end, after the items", () => {
    const source = Emitter.create<number, string, never>();
    const chained = pipe(
      source.stream,
      Stream.map((result: string) => result.toUpperCase()),
      Stream.flatMap((result: string) => Stream.end(`got ${result}`)),
    );
    const seen = record(chained);
    source.emit(1);
    source.emit(2);
    source.complete("done");
    expect(seen.items)
      .toEqual([1, 2]);
    expect(seen.ends.ok)
      .toBe("got DONE");
  });

  test("a failure emitted as an item goes to error, and the stream carries on", () => {
    const source = Emitter.create<number, void, string>();
    const seen = record(source.stream);
    source.emit(1);
    source.emitError("bad input");
    source.emit(2);
    source.complete();
    expect(seen.items)
      .toEqual([1, 2]);
    expect(seen.failures)
      .toEqual(["bad input"]);
  });

  test("a late subscriber to a finished emitter gets its end at once", () => {
    const source = Emitter.create<number, string, never>();
    source.complete("finished");
    const late = record(source.stream);
    expect(late.ends.ok)
      .toBe("finished");
  });
});

describe("cancellation", () => {
  test("cancelling a delayed Task before it finishes means it never succeeds", async () => {
    let succeeded = false;
    const cancel = pipe(Task.delay(20), Task.map(() => {
      succeeded = true;
      return 1;
    }))
      .run({ ok: () => undefined, error: () => undefined });
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(succeeded)
      .toBe(false);
  });

  test("cancelling a promise task aborts the signal it was given", () => {
    let signal: AbortSignal | undefined;
    const cancel = Task.fromPromise((aborted) => {
      signal = aborted;
      return new Promise<number>(() => undefined);
    })
      .run({ ok: () => undefined, error: () => undefined });
    expect(signal?.aborted)
      .toBe(false);
    cancel();
    expect(signal?.aborted)
      .toBe(true);
  });

  test("unsubscribing from a stream stops its items", () => {
    const source = Emitter.create<number, void, never>();
    const seen = record(source.stream);
    source.emit(1);
    seen.stop();
    source.emit(2);
    expect(seen.items)
      .toEqual([1]);
  });
});

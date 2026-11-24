import { describe, expect, test } from "vitest";
import { Left, Right } from "../monad/either.ts";
import { match } from "../monad/monad.ts";
import { Stream, subscribe } from "./stream.ts";
import { fail, fromComputation, succeed, type Task } from "./task.ts";
import { Superseded, type Switched, switchMap } from "./switch-map.ts";

/** A task that waits: its ok and error are kept to settle it later, and its cancels are counted. */
function waiting<T, E>() {
  const settle: { ok?: (value: T) => void; error?: (error: E) => void } = {};
  let cancels = 0;
  const task: Task<T, E> = fromComputation<T, E>((ok, error) => {
    settle.ok = ok;
    settle.error = error;
    return () => {
      cancels += 1;
    };
  });
  return { task, settle, cancelled: () => cancels };
}

/** The items and the end of a switched stream, as they arrive. */
function collect<T, U, F>(stream: Stream<Switched<T, U, F>, void, unknown>) {
  const items: Switched<T, U, F>[] = [];
  const ended: { ok?: void; error?: unknown }[] = [];
  const cancel = subscribe(stream, {
    next: (item) => {
      match<Switched<T, U, F>, unknown, void>(item, {
        Right: (value) => {
          items.push(value);
        },
        Left: () => {},
      });
    },
    end: (result) => {
      match<void, unknown, void>(result, {
        Right: () => {
          ended.push({ ok: undefined });
        },
        Left: (error) => {
          ended.push({ error });
        },
      });
    },
  });
  return { items, ended, cancel };
}

const outcomeOf = <U, F>(item: Switched<unknown, U, F>) => item.outcome;

describe("switchMap", () => {
  test("each value runs its task, and the items arrive in order, then the end", () => {
    const source = Stream.fromIterable([1, 2, 3]);
    const { items, ended } = collect(switchMap(source, (n) => succeed(n * 10)));
    expect(items.map((item) => [item.value, outcomeOf(item)]))
      .toEqual([
        [1, Right.of(10)],
        [2, Right.of(20)],
        [3, Right.of(30)],
      ]);
    expect(ended)
      .toEqual([{ ok: undefined }]);
  });

  test("the stream does not end while a task is still running", () => {
    const first = waiting<number, string>();
    const source = Stream.fromIterable([1]);
    const { items, ended } = collect(switchMap(source, () => first.task));
    expect(ended)
      .toEqual([]);
    first.settle.ok?.(7);
    expect(items.map((item) => outcomeOf(item)))
      .toEqual([Right.of(7)]);
    expect(ended)
      .toEqual([{ ok: undefined }]);
  });

  test("a newer value cancels the running task, which is reported as Superseded", () => {
    const tasks = [waiting<string, string>(), waiting<string, string>()];
    const source = Stream.fromIterable([1, 2]);
    let index = 0;
    const { items } = collect(switchMap(source, () => tasks[index++]!.task));
    expect(tasks[0]!.cancelled())
      .toBe(1);
    expect(items.map((item) => [item.value, outcomeOf(item)]))
      .toEqual([[1, Left.of(Superseded.of())]]);
    tasks[1]!.settle.ok?.("second");
    expect(items.map((item) => [item.value, outcomeOf(item)])
      .at(-1))
      .toEqual([2, Right.of("second")]);
  });

  test("a task that fails is an item with a Left outcome, and the stream goes on", () => {
    const source = Stream.fromIterable([1, 2]);
    const { items, ended } = collect(
      switchMap(source, (n) => (n === 1 ? fail("broken") : succeed(n))),
    );
    expect(items.map((item) => [item.value, outcomeOf(item)]))
      .toEqual([
        [1, Left.of("broken")],
        [2, Right.of(2)],
      ]);
    expect(ended)
      .toEqual([{ ok: undefined }]);
  });

  test("a failure of the source fails the stream, and cancels the running task", () => {
    const running = waiting<number, string>();
    const subject = Stream.hot<number, void, string>((observer) => {
      observer.next?.(Right.of(1));
      observer.end?.(Left.of("source broke"));
      return () => {};
    });
    const { ended } = collect(switchMap(subject, () => running.task));
    expect(running.cancelled())
      .toBe(1);
    expect(ended)
      .toEqual([{ error: "source broke" }]);
  });

  test("an error item of the source fails the stream, and cancels the running task", () => {
    const running = waiting<number, string>();
    const subject = Stream.hot<number, void, string>((observer) => {
      observer.next?.(Right.of(1));
      observer.next?.(Left.of("bad item"));
      return () => {};
    });
    const { ended } = collect(switchMap(subject, () => running.task));
    expect(running.cancelled())
      .toBe(1);
    expect(ended)
      .toEqual([{ error: "bad item" }]);
  });

  test("unsubscribing cancels the running task", () => {
    const running = waiting<number, string>();
    const source = Stream.fromIterable([1]);
    const { cancel } = collect(switchMap(source, () => running.task));
    cancel();
    expect(running.cancelled())
      .toBe(1);
  });

  test("unsubscribing when no task is running cancels nothing", () => {
    const source = Stream.fromIterable<number>([]);
    const { cancel, ended } = collect(switchMap(source, (n) => succeed(n)));
    expect(ended)
      .toEqual([{ ok: undefined }]);
    expect(() => cancel())
      .not.toThrow();
  });
});

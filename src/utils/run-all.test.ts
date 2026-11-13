import { describe, expect, test } from "vitest";
import { runAll, runBatches } from "./run-all.ts";

const fail = (message: string) => () => {
  throw new Error(message);
};

describe("runAll", () => {
  test("runs every task in order", () => {
    const ran: number[] = [];
    runAll([() => ran.push(1), () => ran.push(2)]);
    expect(ran).toEqual([1, 2]);
  });

  test("keeps running after a failure, then re-throws the first error", () => {
    const ran: number[] = [];
    expect(() => runAll([() => ran.push(1), fail("first"), () => ran.push(3), fail("second")])).toThrow(
      "first",
    );
    expect(ran).toEqual([1, 3]);
  });

  test("re-throws any thrown value, even undefined", () => {
    let caught: unknown = "nothing";
    try {
      runAll([
        () => {
          throw undefined;
        },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeUndefined();
  });
});

describe("runBatches", () => {
  test("runs batches until the queue is empty, including tasks queued meanwhile", () => {
    const ran: string[] = [];
    const queue: (() => void)[] = [
      () => {
        ran.push("a");
        queue.push(() => ran.push("c"));
      },
      () => ran.push("b"),
    ];
    runBatches(() => queue.splice(0));
    expect(ran).toEqual(["a", "b", "c"]);
  });

  test("does nothing for an empty queue", () => {
    expect(() => runBatches(() => [])).not.toThrow();
  });

  test("runs every batch after a failure, then re-throws the first error", () => {
    const ran: string[] = [];
    const queue: (() => void)[] = [
      () => queue.push(fail("second"), () => ran.push("later")),
      fail("first"),
    ];
    expect(() => runBatches(() => queue.splice(0))).toThrow("first");
    expect(ran).toEqual(["later"]);
  });
});

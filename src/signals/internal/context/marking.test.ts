import { describe, expect, test } from "vitest";
import { afterMarking, marking } from "./marking.ts";

describe("afterMarking", () => {
  test("runs right away when no marking walk is running", () => {
    const log: string[] = [];
    afterMarking(() => log.push("ran"));
    expect(log).toEqual(["ran"]);
  });

  test("waits until the outermost walk has finished", () => {
    const log: string[] = [];
    marking(() => {
      afterMarking(() => log.push("queued 1"));
      marking(() => {
        afterMarking(() => log.push("queued 2"));
        log.push("inner walk done");
      });
      log.push("outer walk done");
    });
    expect(log).toEqual(["inner walk done", "outer walk done", "queued 1", "queued 2"]);
  });

  test("work queued while flushing runs after the current item, in order", () => {
    const log: string[] = [];
    marking(() => {
      afterMarking(() => {
        log.push("first");
        afterMarking(() => log.push("third"));
      });
      afterMarking(() => log.push("second"));
    });
    expect(log).toEqual(["first", "second", "third"]);
  });

  test("runs every item even if one throws, then re-throws the first error", () => {
    const log: string[] = [];
    expect(() =>
      marking(() => {
        afterMarking(() => {
          throw new Error("first");
        });
        afterMarking(() => {
          throw new Error("second");
        });
        afterMarking(() => log.push("still ran"));
      }),
    ).toThrow("first");
    expect(log).toEqual(["still ran"]);
  });

  test("is back to running right away after a walk", () => {
    marking(() => {});
    const log: string[] = [];
    afterMarking(() => log.push("ran"));
    expect(log).toEqual(["ran"]);
  });
});

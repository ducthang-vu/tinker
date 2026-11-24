import { describe, expect, test } from "vitest";
import { createEither, Left, Right } from "./either.ts";
import { Continue, Halt, OUTCOME, type Outcome } from "./outcome.ts";
import { isNone, isSome, createMaybe } from "./maybe.ts";
import { createTask, toPromise } from "../stream/task.ts";

describe("Continue and Halt factories", () => {
  test("Continue.of keeps its value", () => {
    expect(Continue.of(3).value)
      .toBe(3);
  });

  test("Halt.of keeps its reason", () => {
    expect(Halt.of("redirect").reason)
      .toBe("redirect");
  });

  test("a Continue is already in the protocol's form", () => {
    const continued = Continue.of(1);
    expect(continued[OUTCOME]())
      .toBe(continued);
  });

  test("a Halt is already in the protocol's form", () => {
    const halted = Halt.of("no route");
    expect(halted[OUTCOME]())
      .toBe(halted);
  });
});

describe("Right and Left implement the protocol", () => {
  test("a Right continues with the value it holds", () => {
    const form = Right.of<number>(7)
      [OUTCOME]();
    expect(form instanceof Continue && form.value)
      .toBe(7);
  });

  test("a Left halts with the error it holds", () => {
    const form = Left.of<string>("boom")
      [OUTCOME]();
    expect(form instanceof Halt && form.reason)
      .toBe("boom");
  });

  test("a Right is read as a Continue by a generic function", () => {
    const readValue = <T>(outcome: Outcome<T, unknown>): T | undefined => {
      const form = outcome[OUTCOME]();
      return form instanceof Continue ? form.value : undefined;
    };
    expect(readValue(Right.of("ok")))
      .toBe("ok");
    expect(readValue(Left.of("nope")))
      .toBeUndefined();
  });

  test("a Left is read as a Halt by a generic function", () => {
    const readReason = <E>(outcome: Outcome<unknown, E>): E | undefined => {
      const form = outcome[OUTCOME]();
      return form instanceof Halt ? form.reason : undefined;
    };
    expect(readReason(Left.of("nope")))
      .toBe("nope");
    expect(readReason(Right.of("ok")))
      .toBeUndefined();
  });
});

describe("the from factories", () => {
  test("Either.from a Continue is a Right holding the value", () => {
    expect(createEither(Continue.of(2)))
      .toEqual(Right.of(2));
  });

  test("Either.from a Halt is a Left holding the reason", () => {
    expect(createEither(Halt.of("no")))
      .toEqual(Left.of("no"));
  });

  test("Maybe.from a Continue is Some holding the value", () => {
    expect(isSome(createMaybe(Continue.of(2))))
      .toBe(true);
  });

  test("Maybe.from a Halt is None: the reason is lost", () => {
    expect(isNone(createMaybe(Halt.of("no"))))
      .toBe(true);
  });

  test("Task.from a Continue succeeds with the value", async () => {
    await expect(toPromise(createTask(Continue.of(5))))
      .resolves.toBe(5);
  });

  test("Task.from a Halt fails with the reason", async () => {
    await expect(toPromise(createTask(Halt.of(new Error("halted")))))
      .rejects.toThrow("halted");
  });
});

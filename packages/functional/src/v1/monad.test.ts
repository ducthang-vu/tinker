import { describe, expect, test } from "vitest";
import { Left, Right } from "./either.ts";
import { EQUALS, type Equatable, isEqual, match } from "./monad.ts";
import { None, Some } from "./maybe.ts";

describe("match", () => {
  test("an Either is handled by the handler named after its case, with its argument", () => {
    expect(match(Right.of(2), { Right: (value) => value * 10, Left: () => -1 }))
      .toBe(20);
    expect(match(Left.of("boom"), { Right: () => 0, Left: (error) => error.length }))
      .toBe(4);
  });

  test("a Maybe is handled by the handler named after its case: Some gets the value, None gets nothing", () => {
    expect(match(Some.of("x"), { Some: (value) => value + "!", None: () => "none" }))
      .toBe("x!");
    expect(match(None.of<string>(), { Some: (value) => value + "!", None: () => "none" }))
      .toBe("none");
  });
});

describe("isEqual", () => {
  test("boxes are equal only with the same case and equal arguments", () => {
    expect(isEqual(Right.of(1), Right.of(1)))
      .toBe(true);
    expect(isEqual(Right.of(1), Right.of(2)))
      .toBe(false);
    expect(isEqual(Right.of(1), Left.of(1)))
      .toBe(false);
    expect(isEqual(Some.of(1), None.of()))
      .toBe(false);
    expect(isEqual(None.of(), None.of()))
      .toBe(true);
    expect(isEqual(Left.of("e"), Left.of("e")))
      .toBe(true);
    expect(isEqual(Left.of("e"), Left.of("f")))
      .toBe(false);
  });

  test("NaN equals NaN and 0 equals -0, as Set and Map treat them", () => {
    expect(isEqual(NaN, NaN))
      .toBe(true);
    expect(isEqual(0, -0))
      .toBe(true);
    expect(isEqual(Some.of(NaN), Some.of(NaN)))
      .toBe(true);
    expect(isEqual(Right.of(0), Right.of(-0)))
      .toBe(true);
  });

  test("nested boxes compare by value, all the way down", () => {
    expect(isEqual(Some.of(Some.of(1)), Some.of(Some.of(1))))
      .toBe(true);
    expect(isEqual(Some.of(Some.of(1)), Some.of(Some.of(2))))
      .toBe(false);
  });

  test("objects are equal only to themselves", () => {
    const object = { a: 1 };
    expect(isEqual(object, object))
      .toBe(true);
    expect(isEqual({ a: 1 }, { a: 1 }))
      .toBe(false);
    expect(isEqual(Some.of({ a: 1 }), Some.of({ a: 1 })))
      .toBe(false);
  });

  test("a value that implements EQUALS decides for itself", () => {
    class Cents implements Equatable {
      constructor(readonly amount: number) {}

      [EQUALS](other: unknown): boolean {
        return other instanceof Cents && Math.round(other.amount) === Math.round(this.amount);
      }
    }
    expect(isEqual(new Cents(1.2), new Cents(0.9)))
      .toBe(true);
    expect(isEqual(new Cents(1.2), new Cents(2)))
      .toBe(false);
  });

  test("a box is not equal to a value that is not a box", () => {
    expect(isEqual(Some.of(1), 1))
      .toBe(false);
    expect(isEqual(Some.of(1), {}))
      .toBe(false);
    expect(isEqual(Some.of(1), null))
      .toBe(false);
  });
});

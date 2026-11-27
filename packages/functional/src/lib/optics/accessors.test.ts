import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { lensLaws, type LawCheck, optionalLaws, EDGE_VALUES } from "../../testing.ts";
import { None, Some } from "../monad/maybe.ts";
import { isEqual } from "../monad/monad.ts";
import { at, byKey, prop } from "./accessors.ts";

/** Runs every check of a law checker, and expects none to throw. */
const expectLawful = (checks: readonly LawCheck[]): void => {
  for (const [description, check] of checks) {
    expect(check, description)
      .not.toThrow();
  }
};

/** Lists of every edge value, with and without the positions the tests read. */
const lists: readonly (readonly unknown[])[] = [
  [],
  [0],

  [, 1],
  EDGE_VALUES,
  EDGE_VALUES.slice()
    .reverse(),
];

describe("prop", () => {
  interface Point {
    readonly x: unknown;
    readonly y: number;
  }
  const x = prop<Point>()("x");

  test("reads and writes one key, and copies the record", () => {
    const point: Point = { x: 1, y: 2 };
    expect(x.get(point))
      .toBe(1);
    expect(x.set(3, point))
      .toEqual({ x: 3, y: 2 });
    expect(point)
      .toEqual({ x: 1, y: 2 });
  });

  test("returns the same record when the key already holds the part", () => {
    const point: Point = { x: NaN, y: 2 };
    expect(x.set(NaN, point))
      .toBe(point);
  });

  test("tells 0 from -0, as Object.is does", () => {
    const point: Point = { x: 0, y: 2 };
    expect(Object.is(x.set(-0, point).x, -0))
      .toBe(true);
  });

  test("obeys the lens laws on every edge value", () => {
    expectLawful(lensLaws({
      name: "prop(x)",
      optic: x,
      samples: EDGE_VALUES.map((value) => ({ x: value, y: 0 })),
      values: EDGE_VALUES,
      equal: isDeepStrictEqual,
    }));
  });
});

describe("at", () => {
  test("reads the item at the index, or nothing when there is none", () => {
    expect(isEqual(at<string>(1)
      .preview(["a", "b"]), Some.of("b")))
      .toBe(true);
    expect(isEqual(at<string>(2)
      .preview(["a", "b"]), None.of()))
      .toBe(true);
  });

  test.each([-1, 0.5, NaN, Infinity])("an index of %s holds nothing", (index) => {
    const list = ["a", "b"];
    expect(isEqual(at<string>(index)
      .preview(list), None.of()))
      .toBe(true);
    expect(at<string>(index)
      .set("c", list))
      .toBe(list);
  });

  test("a hole holds nothing, and set does not fill it", () => {
    const list: readonly (number | undefined)[] = [, 1];
    expect(isEqual(at<number | undefined>(0)
      .preview(list), None.of()))
      .toBe(true);
    expect(at<number | undefined>(0)
      .set(undefined, list))
      .toBe(list);
  });

  test("set copies the list, and keeps its holes", () => {
    const list: readonly (number | undefined)[] = [, 1, 2];
    const next = at<number | undefined>(2)
      .set(3, list);
    expect(next)
      .toEqual([, 1, 3]);
    expect(0 in next)
      .toBe(false);
    expect(list[2])
      .toBe(2);
  });

  test("set returns the same list when the item is unchanged, or missing", () => {
    const list = ["a", "b"];
    expect(at<string>(0)
      .set("a", list))
      .toBe(list);
    expect(at<string>(5)
      .set("z", list))
      .toBe(list);
  });

  test.each([0, 1, 3])("at(%s) obeys the optional laws on every edge value", (index) => {
    expectLawful(optionalLaws({
      name: `at(${index})`,
      optic: at<unknown>(index),
      samples: lists,
      values: EDGE_VALUES,
      equal: isDeepStrictEqual,
    }));
  });
});

describe("byKey", () => {
  interface Line {
    readonly id: unknown;
    readonly qty: unknown;
  }
  const line = (id: unknown, qty: unknown): Line => ({ id, qty });
  const second = byKey((item: Line) => item.id, 2);

  test("reads the item with the key, wherever it is", () => {
    const lines = [line(1, "a"), line(2, "b")];
    expect(isEqual(second.preview(lines), Some.of(lines[1])))
      .toBe(true);
    expect(isEqual(second.preview(lines.slice()
      .reverse()), Some.of(lines[1])))
      .toBe(true);
  });

  test("reads nothing once the item is gone, and set leaves the list as it is", () => {
    const lines = [line(1, "a")];
    expect(isEqual(second.preview(lines), None.of()))
      .toBe(true);
    expect(second.set(line(2, "z"), lines))
      .toBe(lines);
  });

  test("set replaces the first item with the key, and copies the list", () => {
    const lines = [line(2, "a"), line(1, "b"), line(2, "c")];
    expect(second.modify((item) => ({ ...item, qty: "z" }), lines))
      .toEqual([line(2, "z"), line(1, "b"), line(2, "c")]);
  });

  test("compares keys with isEqual, so NaN finds NaN", () => {
    const lines = [line(NaN, "a")];
    expect(isEqual(byKey((item: Line) => item.id, NaN)
      .preview(lines), Some.of(lines[0])))
      .toBe(true);
  });

  test("obeys the optional laws on every edge value, for items that keep their key", () => {
    const samples = [
      [],
      [line(1, 0)],
      EDGE_VALUES.map((qty, index) => line(index, qty)),
      [line(2, "first"), line(2, "second")],
    ];
    expectLawful(optionalLaws({
      name: "byKey(2)",
      optic: second,
      samples,
      values: EDGE_VALUES.map((qty) => line(2, qty)),
      equal: isDeepStrictEqual,
    }));
  });
});

import { describe, expect, test } from "vitest";
import { namesOf, parsePattern } from "./pattern.ts";

describe("parsePattern", () => {
  test("an array pattern needs its closing ]", () => {
    expect(parsePattern("[a")
      .isLeft())
      .toBe(true);
  });

  test("an array pattern with a rest names the rest", () => {
    expect(parsePattern("[first, ...rest]")
      .getOrThrow())
      .toEqual({ kind: "array", items: [{ kind: "bind", name: "first" }], rest: "rest" });
  });

  test("an empty array pattern, with or without a trailing comma", () => {
    expect(parsePattern("[]")
      .getOrThrow())
      .toEqual({ kind: "array", items: [] });
    expect(parsePattern("[1,]")
      .getOrThrow())
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });
});

describe("namesOf", () => {
  test("lists the names a pattern binds, through objects and arrays", () => {
    expect(namesOf(parsePattern("{ id, tags: [first, ...rest] }")
      .getOrThrow()))
      .toEqual(["id", "first", "rest"]);
  });

  test("an array without a rest binds its items' names only", () => {
    expect(namesOf(parsePattern("[a, b]")
      .getOrThrow()))
      .toEqual(["a", "b"]);
  });

  test("a pattern that binds nothing has no names", () => {
    expect(namesOf(parsePattern("1")
      .getOrThrow()))
      .toEqual([]);
  });
});

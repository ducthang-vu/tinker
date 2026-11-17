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

describe("parsePattern: the remaining patterns", () => {
  test("alternatives are the options, each a pattern, and bind no names", () => {
    expect(parsePattern(`"a" | "b"`)
      .getOrThrow())
      .toEqual({ kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] });
    expect(parsePattern(`"a|b"`)
      .getOrThrow())
      .toEqual({ kind: "value", value: "a|b" });
    expect(parsePattern("name | 1")
      .isLeft())
      .toBe(true);
  });

  test("a range takes two numbers, the smaller first", () => {
    expect(parsePattern("0..12")
      .getOrThrow())
      .toEqual({ kind: "range", min: 0, max: 12 });
    expect(parsePattern("-1.5..2")
      .getOrThrow())
      .toEqual({ kind: "range", min: -1.5, max: 2 });
    expect(parsePattern("5..1")
      .isLeft())
      .toBe(true);
  });

  test("not takes a pattern, which binds no names", () => {
    expect(parsePattern(`not "guest"`)
      .getOrThrow())
      .toEqual({ kind: "not", pattern: { kind: "value", value: "guest" } });
    expect(parsePattern("not name")
      .isLeft())
      .toBe(true);
  });

  test("present and absent are words; absent only names a key's pattern", () => {
    expect(parsePattern("present")
      .getOrThrow())
      .toEqual({ kind: "present" });
    expect(parsePattern("absent")
      .isLeft())
      .toBe(true);
    expect(parsePattern("{ error: absent }")
      .getOrThrow())
      .toEqual({ kind: "object", fields: [{ key: "error", pattern: { kind: "absent" } }] });
  });

  test("not on its own is still a name, and a name inside a word is not not", () => {
    expect(parsePattern("not")
      .getOrThrow())
      .toEqual({ kind: "bind", name: "not" });
    expect(parsePattern("knot")
      .getOrThrow())
      .toEqual({ kind: "bind", name: "knot" });
  });
});

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

describe("parsePattern: as-patterns", () => {
  test("`as name` binds the whole value, next to the pattern's own names", () => {
    expect(parsePattern("{ id, name } as user")
      .getOrThrow())
      .toEqual({
        kind: "as",
        name: "user",
        pattern: {
          kind: "object",
          fields: [{ key: "id", pattern: { kind: "bind", name: "id" } }, { key: "name", pattern: { kind: "bind", name: "name" } }],
        },
      });
    expect(namesOf(parsePattern("{ id, name } as user")
      .getOrThrow()))
      .toEqual(["id", "name", "user"]);
  });

  test("the alias covers the whole pattern, alternatives included", () => {
    expect(parsePattern(`"a" | "b" as s`)
      .getOrThrow())
      .toEqual({
        kind: "as",
        name: "s",
        pattern: { kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] },
      });
  });

  test("an array with a rest can be aliased", () => {
    expect(namesOf(parsePattern("[first, ...rest] as list")
      .getOrThrow()))
      .toEqual(["first", "rest", "list"]);
  });

  test("` as ` inside braces, brackets, parentheses or quotes is not an alias", () => {
    expect(parsePattern("{ as }")
      .getOrThrow())
      .toEqual({ kind: "object", fields: [{ key: "as", pattern: { kind: "bind", name: "as" } }] });
    expect(parsePattern(`"x as y"`)
      .getOrThrow())
      .toEqual({ kind: "value", value: "x as y" });
    expect(namesOf(parsePattern("some(x as y)")
      .getOrThrow()))
      .toEqual(["x", "y"]);
  });

  test("an alias binds a name the pattern does not, and cannot repeat one it has", () => {
    expect(parsePattern("{ id } as id")
      .isLeft())
      .toBe(true);
    expect(parsePattern("{ id } as true")
      .isLeft())
      .toBe(true);
    expect(parsePattern("1 as")
      .isLeft())
      .toBe(true);
  });

  test("an alias in an object field names that field's value", () => {
    expect(namesOf(parsePattern("{ user: { id } as u }")
      .getOrThrow()))
      .toEqual(["id", "u"]);
  });
});

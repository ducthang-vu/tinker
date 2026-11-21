import { describe, expect, test } from "vitest";
import { namesOf, parsePattern, splitGuard } from "./pattern.ts";

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

  test("alternatives that bind the same names parse, and share those names", () => {
    expect(namesOf(parsePattern(`{ status: "ok", value } | { status: "cached", value }`)
      .getOrThrow()))
      .toEqual(["value"]);
    expect(parsePattern(`{ status: "ok", value } | { status: "cached", value: x }`)
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

  test("an open range has one bound, and no key for the missing one", () => {
    expect(parsePattern("18..")
      .getOrThrow())
      .toEqual({ kind: "range", min: 18 });
    expect(parsePattern("..100")
      .getOrThrow())
      .toEqual({ kind: "range", max: 100 });
    expect(Object.keys(parsePattern("18..")
      .getOrThrow()))
      .toEqual(["kind", "min"]);
    expect(parsePattern("..")
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

describe("parsePattern: tuples", () => {
  test("(a, b) is the array pattern [a, b]", () => {
    expect(parsePattern("(a, b)")
      .getOrThrow())
      .toEqual(parsePattern("[a, b]")
        .getOrThrow());
    expect(namesOf(parsePattern("(x, y, z)")
      .getOrThrow()))
      .toEqual(["x", "y", "z"]);
  });

  test("a tuple takes a rest, an empty tuple is the empty array, and a trailing comma keeps a tuple of one", () => {
    expect(namesOf(parsePattern("(first, ...rest)")
      .getOrThrow()))
      .toEqual(["first", "rest"]);
    expect(parsePattern("()")
      .getOrThrow())
      .toEqual({ kind: "array", items: [] });
    expect(parsePattern("(1,)")
      .getOrThrow())
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });

  test("one pattern in parentheses, with no comma, is that pattern", () => {
    expect(parsePattern("(a)")
      .getOrThrow())
      .toEqual({ kind: "bind", name: "a" });
    expect(parsePattern("(1 | 2)")
      .getOrThrow())
      .toEqual(parsePattern("1 | 2")
        .getOrThrow());
  });

  test("a parenthesis inside a string does not close the group", () => {
    expect(namesOf(parsePattern(`(")", b)`)
      .getOrThrow()))
      .toEqual(["b"]);
  });

  test("a tuple takes objects and arrays inside, and an alias names the whole tuple", () => {
    expect(namesOf(parsePattern("({ id }, [x]) as pair")
      .getOrThrow()))
      .toEqual(["id", "x", "pair"]);
    expect(parsePattern("(1, 2")
      .isLeft())
      .toBe(true);
  });
});

describe("parsePattern: regex patterns", () => {
  test("a regex literal is one pattern, with its source and flags", () => {
    expect(parsePattern(String.raw`/^\d+$/`)
      .getOrThrow())
      .toEqual({ kind: "regex", source: String.raw`^\d+$`, flags: "", names: [] });
    expect(parsePattern("/ab/i")
      .getOrThrow())
      .toEqual({ kind: "regex", source: "ab", flags: "i", names: [] });
  });

  test("named groups are the names the pattern binds", () => {
    expect(namesOf(parsePattern(String.raw`/(?<id>\d+)-(?<tag>\w+)?/`)
      .getOrThrow()))
      .toEqual(["id", "tag"]);
  });

  test("a bar, a slash in a class, and an escaped slash stay inside the literal", () => {
    expect(parsePattern("/a|b/")
      .getOrThrow())
      .toEqual({ kind: "regex", source: "a|b", flags: "", names: [] });
    expect(parsePattern("/[/]/")
      .getOrThrow())
      .toEqual({ kind: "regex", source: "[/]", flags: "", names: [] });
    expect(parsePattern(String.raw`/a\/b/`)
      .getOrThrow())
      .toEqual({ kind: "regex", source: String.raw`a\/b`, flags: "", names: [] });
  });

  test("a regex can be aliased, and can sit under not", () => {
    expect(namesOf(parsePattern("/x/ as whole")
      .getOrThrow()))
      .toEqual(["whole"]);
    expect(parsePattern("not /x/")
      .getOrThrow())
      .toEqual({ kind: "not", pattern: { kind: "regex", source: "x", flags: "", names: [] } });
  });

  test("g and y are refused, and so is a regex that does not compile", () => {
    expect(parsePattern("/a/g")
      .isLeft())
      .toBe(true);
    expect(parsePattern("/a/y")
      .isLeft())
      .toBe(true);
    expect(parsePattern("/(/")
      .isLeft())
      .toBe(true);
    expect(parsePattern("/a/zz")
      .isLeft())
      .toBe(true);
    expect(parsePattern("/abc")
      .isLeft())
      .toBe(true);
  });

  test("a slash in a string is text, and a slash that does not start a pattern is not a regex", () => {
    expect(parsePattern(`"a/b"`)
      .getOrThrow())
      .toEqual({ kind: "value", value: "a/b" });
    expect(parsePattern("x/y")
      .isLeft())
      .toBe(true);
  });

  test("an error about a regex in alternatives names the literal as it was typed", () => {
    const message = parsePattern("/(?<x>a)/ | 1")
      .match({ left: (error) => error.message, right: () => "" });
    expect(message)
      .toContain("/(?<x>a)/");
  });

  test("a regex error names the literal as it was typed", () => {
    const message = parsePattern("/a/g")
      .match({ left: (error) => error.message, right: () => "" });
    expect(message)
      .toContain("/a/g");
  });
});

describe("splitGuard: regex literals", () => {
  test("a slash in a guard is division, and a regex's `when` is not a guard", () => {
    expect(splitGuard("/a/ when a / b > 1"))
      .toEqual({ pattern: "/a/", guard: "a / b > 1" });
    expect(splitGuard("/ when x/"))
      .toEqual({ pattern: "/ when x/" });
  });
});

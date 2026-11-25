import { describe, expect, test } from "vitest";
import { namesOf, parsePattern, splitGuard } from "./pattern.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

describe("parsePattern", () => {
  test("an array pattern needs its closing ]", () => {
    expect(match(parsePattern("[a"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an array pattern with a rest names the rest", () => {
    expect(valueOrThrow(parsePattern("[first, ...rest]")))
      .toEqual({ kind: "array", items: [{ kind: "bind", name: "first" }], rest: "rest" });
  });

  test("an empty array pattern, with or without a trailing comma", () => {
    expect(valueOrThrow(parsePattern("[]")))
      .toEqual({ kind: "array", items: [] });
    expect(valueOrThrow(parsePattern("[1,]")))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });
});

describe("namesOf", () => {
  test("lists the names a pattern binds, through objects and arrays", () => {
    expect(namesOf(valueOrThrow(parsePattern("{ id, tags: [first, ...rest] }"))))
      .toEqual(["id", "first", "rest"]);
  });

  test("an array without a rest binds its items' names only", () => {
    expect(namesOf(valueOrThrow(parsePattern("[a, b]"))))
      .toEqual(["a", "b"]);
  });

  test("a pattern that binds nothing has no names", () => {
    expect(namesOf(valueOrThrow(parsePattern("1"))))
      .toEqual([]);
  });
});

describe("parsePattern: the remaining patterns", () => {
  test("alternatives are the options, each a pattern, and bind no names", () => {
    expect(valueOrThrow(parsePattern(`"a" | "b"`)))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] });
    expect(valueOrThrow(parsePattern(`"a|b"`)))
      .toEqual({ kind: "value", value: "a|b" });
    expect(match(parsePattern("name | 1"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("alternatives that bind the same names parse, and share those names", () => {
    expect(namesOf(valueOrThrow(parsePattern(`{ status: "ok", value } | { status: "cached", value }`))))
      .toEqual(["value"]);
    expect(match(parsePattern(`{ status: "ok", value } | { status: "cached", value: x }`), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("a range takes two numbers, the smaller first", () => {
    expect(valueOrThrow(parsePattern("0..12")))
      .toEqual({ kind: "range", min: 0, max: 12 });
    expect(valueOrThrow(parsePattern("-1.5..2")))
      .toEqual({ kind: "range", min: -1.5, max: 2 });
    expect(match(parsePattern("5..1"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an open range has one bound, and no key for the missing one", () => {
    expect(valueOrThrow(parsePattern("18..")))
      .toEqual({ kind: "range", min: 18 });
    expect(valueOrThrow(parsePattern("..100")))
      .toEqual({ kind: "range", max: 100 });
    expect(Object.keys(valueOrThrow(parsePattern("18.."))))
      .toEqual(["kind", "min"]);
    expect(match(parsePattern(".."), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("not takes a pattern, which binds no names", () => {
    expect(valueOrThrow(parsePattern(`not "guest"`)))
      .toEqual({ kind: "not", pattern: { kind: "value", value: "guest" } });
    expect(match(parsePattern("not name"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("present and absent are words; absent only names a key's pattern", () => {
    expect(valueOrThrow(parsePattern("present")))
      .toEqual({ kind: "present" });
    expect(match(parsePattern("absent"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(valueOrThrow(parsePattern("{ error: absent }")))
      .toEqual({ kind: "object", fields: [{ key: "error", pattern: { kind: "absent" } }] });
  });

  test("not on its own is still a name, and a name inside a word is not not", () => {
    expect(valueOrThrow(parsePattern("not")))
      .toEqual({ kind: "bind", name: "not" });
    expect(valueOrThrow(parsePattern("knot")))
      .toEqual({ kind: "bind", name: "knot" });
  });
});

describe("parsePattern: as-patterns", () => {
  test("`as name` binds the whole value, next to the pattern's own names", () => {
    expect(valueOrThrow(parsePattern("{ id, name } as user")))
      .toEqual({
        kind: "as",
        name: "user",
        pattern: {
          kind: "object",
          fields: [{ key: "id", pattern: { kind: "bind", name: "id" } }, { key: "name", pattern: { kind: "bind", name: "name" } }],
        },
      });
    expect(namesOf(valueOrThrow(parsePattern("{ id, name } as user"))))
      .toEqual(["id", "name", "user"]);
  });

  test("the alias covers the whole pattern, alternatives included", () => {
    expect(valueOrThrow(parsePattern(`"a" | "b" as s`)))
      .toEqual({
        kind: "as",
        name: "s",
        pattern: { kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] },
      });
  });

  test("an array with a rest can be aliased", () => {
    expect(namesOf(valueOrThrow(parsePattern("[first, ...rest] as list"))))
      .toEqual(["first", "rest", "list"]);
  });

  test("` as ` inside braces, brackets, parentheses or quotes is not an alias", () => {
    expect(valueOrThrow(parsePattern("{ as }")))
      .toEqual({ kind: "object", fields: [{ key: "as", pattern: { kind: "bind", name: "as" } }] });
    expect(valueOrThrow(parsePattern(`"x as y"`)))
      .toEqual({ kind: "value", value: "x as y" });
    expect(namesOf(valueOrThrow(parsePattern("some(x as y)"))))
      .toEqual(["x", "y"]);
  });

  test("an alias binds a name the pattern does not, and cannot repeat one it has", () => {
    expect(match(parsePattern("{ id } as id"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("{ id } as true"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("1 as"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an alias in an object field names that field's value", () => {
    expect(namesOf(valueOrThrow(parsePattern("{ user: { id } as u }"))))
      .toEqual(["id", "u"]);
  });
});

describe("parsePattern: tuples", () => {
  test("(a, b) is the array pattern [a, b]", () => {
    expect(valueOrThrow(parsePattern("(a, b)")))
      .toEqual(valueOrThrow(parsePattern("[a, b]")));
    expect(namesOf(valueOrThrow(parsePattern("(x, y, z)"))))
      .toEqual(["x", "y", "z"]);
  });

  test("a tuple takes a rest, an empty tuple is the empty array, and a trailing comma keeps a tuple of one", () => {
    expect(namesOf(valueOrThrow(parsePattern("(first, ...rest)"))))
      .toEqual(["first", "rest"]);
    expect(valueOrThrow(parsePattern("()")))
      .toEqual({ kind: "array", items: [] });
    expect(valueOrThrow(parsePattern("(1,)")))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });

  test("one pattern in parentheses, with no comma, is that pattern", () => {
    expect(valueOrThrow(parsePattern("(a)")))
      .toEqual({ kind: "bind", name: "a" });
    expect(valueOrThrow(parsePattern("(1 | 2)")))
      .toEqual(valueOrThrow(parsePattern("1 | 2")));
  });

  test("a parenthesis inside a string does not close the group", () => {
    expect(namesOf(valueOrThrow(parsePattern(`(")", b)`))))
      .toEqual(["b"]);
  });

  test("a tuple takes objects and arrays inside, and an alias names the whole tuple", () => {
    expect(namesOf(valueOrThrow(parsePattern("({ id }, [x]) as pair"))))
      .toEqual(["id", "x", "pair"]);
    expect(match(parsePattern("(1, 2"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });
});

describe("parsePattern: regex patterns", () => {
  test("a regex literal is one pattern, with its source and flags", () => {
    expect(valueOrThrow(parsePattern(String.raw`/^\d+$/`)))
      .toEqual({ kind: "regex", source: String.raw`^\d+$`, flags: "", names: [] });
    expect(valueOrThrow(parsePattern("/ab/i")))
      .toEqual({ kind: "regex", source: "ab", flags: "i", names: [] });
  });

  test("named groups are the names the pattern binds", () => {
    expect(namesOf(valueOrThrow(parsePattern(String.raw`/(?<id>\d+)-(?<tag>\w+)?/`))))
      .toEqual(["id", "tag"]);
  });

  test("a bar, a slash in a class, and an escaped slash stay inside the literal", () => {
    expect(valueOrThrow(parsePattern("/a|b/")))
      .toEqual({ kind: "regex", source: "a|b", flags: "", names: [] });
    expect(valueOrThrow(parsePattern("/[/]/")))
      .toEqual({ kind: "regex", source: "[/]", flags: "", names: [] });
    expect(valueOrThrow(parsePattern(String.raw`/a\/b/`)))
      .toEqual({ kind: "regex", source: String.raw`a\/b`, flags: "", names: [] });
  });

  test("a regex can be aliased, and can sit under not", () => {
    expect(namesOf(valueOrThrow(parsePattern("/x/ as whole"))))
      .toEqual(["whole"]);
    expect(valueOrThrow(parsePattern("not /x/")))
      .toEqual({ kind: "not", pattern: { kind: "regex", source: "x", flags: "", names: [] } });
  });

  test("g and y are refused, and so is a regex that does not compile", () => {
    expect(match(parsePattern("/a/g"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("/a/y"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("/(/"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("/a/zz"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("/abc"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("a slash in a string is text, and a slash that does not start a pattern is not a regex", () => {
    expect(valueOrThrow(parsePattern(`"a/b"`)))
      .toEqual({ kind: "value", value: "a/b" });
    expect(match(parsePattern("x/y"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an error about a regex in alternatives names the literal as it was typed", () => {
    const message = match(parsePattern("/(?<x>a)/ | 1"), { Left: (error) => error.message, Right: () => "" });
    expect(message)
      .toContain("/(?<x>a)/");
  });

  test("a regex error names the literal as it was typed", () => {
    const message = match(parsePattern("/a/g"), { Left: (error) => error.message, Right: () => "" });
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

describe("parsePattern: escaped quotes", () => {
  test("an escaped quote does not close a string, so a bar inside it is text", () => {
    expect(valueOrThrow(parsePattern(String.raw`"a\"|b"`)))
      .toEqual({ kind: "value", value: `a"|b` });
    expect(valueOrThrow(parsePattern(String.raw`"\")" | "a"`)))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: `")` }, { kind: "value", value: "a" }] });
  });

  test("an escaped quote does not end a string before `when`, a bracket or `as`", () => {
    expect(splitGuard(String.raw`"x\" when y" when z`))
      .toEqual({ pattern: String.raw`"x\" when y"`, guard: "z" });
    expect(namesOf(valueOrThrow(parsePattern(String.raw`("\")", b)`))))
      .toEqual(["b"]);
    expect(namesOf(valueOrThrow(parsePattern(String.raw`"\" as x" as y`))))
      .toEqual(["y"]);
  });
});

describe("parsePattern: duplicate names", () => {
  test("a name bound twice in one pattern is an error, whatever its shape", () => {
    for (const text of ["[a, a]", "{ a, b: a }", "(a, a)", "[a, [a]]", "{ k: { a }, j: [a] }", "{ a, b: a } as c"]) {
      expect(match(parsePattern(text), { Left: () => true, Right: () => false }), text)
        .toBe(true);
    }
    expect(match(parsePattern("[a, a]"), { Left: (error) => error.message, Right: () => "" }))
      .toContain(`The name "a" is bound twice`);
  });

  test("distinct names, and alternatives that bind the same names, are not duplicates", () => {
    expect(namesOf(valueOrThrow(parsePattern("[a, b]"))))
      .toEqual(["a", "b"]);
    expect(match(parsePattern("{ a } | { a }"), { Left: () => false, Right: () => true }))
      .toBe(true);
  });
});

describe("parsePattern: nested quantifiers in a regex", () => {
  const refusal = (text: string) => match(parsePattern(text), {
    Left: (error) => error.message,
    Right: () => undefined,
  });

  test("a regex that repeats a group which already repeats is refused, with the fix", () => {
    for (const text of ["/^(a+)+$/", "/(a{2,})*/", "/((a)+)+/", "/(?:ab+)+/", "/((a)+b)+/"]) {
      expect(refusal(text))
        .toMatch(/repeats a group that already repeats/);
    }
  });

  test("a regex that repeats each part once, optional groups, escapes and classes is accepted", () => {
    for (const text of ["/^(a+)?$/", "/^\\d+$/", "/(a)+/", "/^[+*]+$/", "/^\\(a+\\)+$/", "/^(ab|cd)+$/", "/^((a)b)+$/"]) {
      expect(refusal(text))
        .toBeUndefined();
    }
  });
});

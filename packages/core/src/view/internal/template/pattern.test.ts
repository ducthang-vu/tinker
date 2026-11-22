import { describe, expect, test } from "vitest";
import { namesOf, parsePattern, splitGuard } from "./pattern.ts";
import { match, Left, Right } from "@tinker/functional/v1";

describe("parsePattern", () => {
  test("an array pattern needs its closing ]", () => {
    expect(match(parsePattern("[a"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an array pattern with a rest names the rest", () => {
    expect(match(parsePattern("[first, ...rest]"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "array", items: [{ kind: "bind", name: "first" }], rest: "rest" });
  });

  test("an empty array pattern, with or without a trailing comma", () => {
    expect(match(parsePattern("[]"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "array", items: [] });
    expect(match(parsePattern("[1,]"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });
});

describe("namesOf", () => {
  test("lists the names a pattern binds, through objects and arrays", () => {
    expect(namesOf(match(parsePattern("{ id, tags: [first, ...rest] }"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["id", "first", "rest"]);
  });

  test("an array without a rest binds its items' names only", () => {
    expect(namesOf(match(parsePattern("[a, b]"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["a", "b"]);
  });

  test("a pattern that binds nothing has no names", () => {
    expect(namesOf(match(parsePattern("1"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual([]);
  });
});

describe("parsePattern: the remaining patterns", () => {
  test("alternatives are the options, each a pattern, and bind no names", () => {
    expect(match(parsePattern(`"a" | "b"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] });
    expect(match(parsePattern(`"a|b"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "value", value: "a|b" });
    expect(match(parsePattern("name | 1"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("alternatives that bind the same names parse, and share those names", () => {
    expect(namesOf(match(parsePattern(`{ status: "ok", value } | { status: "cached", value }`), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["value"]);
    expect(match(parsePattern(`{ status: "ok", value } | { status: "cached", value: x }`), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("a range takes two numbers, the smaller first", () => {
    expect(match(parsePattern("0..12"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "range", min: 0, max: 12 });
    expect(match(parsePattern("-1.5..2"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "range", min: -1.5, max: 2 });
    expect(match(parsePattern("5..1"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("an open range has one bound, and no key for the missing one", () => {
    expect(match(parsePattern("18.."), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "range", min: 18 });
    expect(match(parsePattern("..100"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "range", max: 100 });
    expect(Object.keys(match(parsePattern("18.."), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["kind", "min"]);
    expect(match(parsePattern(".."), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("not takes a pattern, which binds no names", () => {
    expect(match(parsePattern(`not "guest"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "not", pattern: { kind: "value", value: "guest" } });
    expect(match(parsePattern("not name"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("present and absent are words; absent only names a key's pattern", () => {
    expect(match(parsePattern("present"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "present" });
    expect(match(parsePattern("absent"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parsePattern("{ error: absent }"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "object", fields: [{ key: "error", pattern: { kind: "absent" } }] });
  });

  test("not on its own is still a name, and a name inside a word is not not", () => {
    expect(match(parsePattern("not"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "bind", name: "not" });
    expect(match(parsePattern("knot"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "bind", name: "knot" });
  });
});

describe("parsePattern: as-patterns", () => {
  test("`as name` binds the whole value, next to the pattern's own names", () => {
    expect(match(parsePattern("{ id, name } as user"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({
        kind: "as",
        name: "user",
        pattern: {
          kind: "object",
          fields: [{ key: "id", pattern: { kind: "bind", name: "id" } }, { key: "name", pattern: { kind: "bind", name: "name" } }],
        },
      });
    expect(namesOf(match(parsePattern("{ id, name } as user"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["id", "name", "user"]);
  });

  test("the alias covers the whole pattern, alternatives included", () => {
    expect(match(parsePattern(`"a" | "b" as s`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({
        kind: "as",
        name: "s",
        pattern: { kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] },
      });
  });

  test("an array with a rest can be aliased", () => {
    expect(namesOf(match(parsePattern("[first, ...rest] as list"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["first", "rest", "list"]);
  });

  test("` as ` inside braces, brackets, parentheses or quotes is not an alias", () => {
    expect(match(parsePattern("{ as }"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "object", fields: [{ key: "as", pattern: { kind: "bind", name: "as" } }] });
    expect(match(parsePattern(`"x as y"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "value", value: "x as y" });
    expect(namesOf(match(parsePattern("some(x as y)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
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
    expect(namesOf(match(parsePattern("{ user: { id } as u }"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["id", "u"]);
  });
});

describe("parsePattern: tuples", () => {
  test("(a, b) is the array pattern [a, b]", () => {
    expect(match(parsePattern("(a, b)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual(match(parsePattern("[a, b]"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }));
    expect(namesOf(match(parsePattern("(x, y, z)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["x", "y", "z"]);
  });

  test("a tuple takes a rest, an empty tuple is the empty array, and a trailing comma keeps a tuple of one", () => {
    expect(namesOf(match(parsePattern("(first, ...rest)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["first", "rest"]);
    expect(match(parsePattern("()"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "array", items: [] });
    expect(match(parsePattern("(1,)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });

  test("one pattern in parentheses, with no comma, is that pattern", () => {
    expect(match(parsePattern("(a)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "bind", name: "a" });
    expect(match(parsePattern("(1 | 2)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual(match(parsePattern("1 | 2"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }));
  });

  test("a parenthesis inside a string does not close the group", () => {
    expect(namesOf(match(parsePattern(`(")", b)`), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["b"]);
  });

  test("a tuple takes objects and arrays inside, and an alias names the whole tuple", () => {
    expect(namesOf(match(parsePattern("({ id }, [x]) as pair"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["id", "x", "pair"]);
    expect(match(parsePattern("(1, 2"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });
});

describe("parsePattern: regex patterns", () => {
  test("a regex literal is one pattern, with its source and flags", () => {
    expect(match(parsePattern(String.raw`/^\d+$/`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "regex", source: String.raw`^\d+$`, flags: "", names: [] });
    expect(match(parsePattern("/ab/i"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "regex", source: "ab", flags: "i", names: [] });
  });

  test("named groups are the names the pattern binds", () => {
    expect(namesOf(match(parsePattern(String.raw`/(?<id>\d+)-(?<tag>\w+)?/`), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["id", "tag"]);
  });

  test("a bar, a slash in a class, and an escaped slash stay inside the literal", () => {
    expect(match(parsePattern("/a|b/"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "regex", source: "a|b", flags: "", names: [] });
    expect(match(parsePattern("/[/]/"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "regex", source: "[/]", flags: "", names: [] });
    expect(match(parsePattern(String.raw`/a\/b/`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "regex", source: String.raw`a\/b`, flags: "", names: [] });
  });

  test("a regex can be aliased, and can sit under not", () => {
    expect(namesOf(match(parsePattern("/x/ as whole"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["whole"]);
    expect(match(parsePattern("not /x/"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
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
    expect(match(parsePattern(`"a/b"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
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
    expect(match(parsePattern(String.raw`"a\"|b"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "value", value: `a"|b` });
    expect(match(parsePattern(String.raw`"\")" | "a"`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: `")` }, { kind: "value", value: "a" }] });
  });

  test("an escaped quote does not end a string before `when`, a bracket or `as`", () => {
    expect(splitGuard(String.raw`"x\" when y" when z`))
      .toEqual({ pattern: String.raw`"x\" when y"`, guard: "z" });
    expect(namesOf(match(parsePattern(String.raw`("\")", b)`), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["b"]);
    expect(namesOf(match(parsePattern(String.raw`"\" as x" as y`), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
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
    expect(namesOf(match(parsePattern("[a, b]"), { Left: (error) => {
      throw error;
    }, Right: (value) => value })))
      .toEqual(["a", "b"]);
    expect(match(parsePattern("{ a } | { a }"), { Left: () => false, Right: () => true }))
      .toBe(true);
  });
});

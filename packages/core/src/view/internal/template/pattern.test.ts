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
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "array", items: [{ kind: "bind", name: "first" }], rest: "rest" });
  });

  test("an empty array pattern, with or without a trailing comma", () => {
    expect(parsePattern("[]")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "array", items: [] });
    expect(parsePattern("[1,]")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });
});

describe("namesOf", () => {
  test("lists the names a pattern binds, through objects and arrays", () => {
    expect(namesOf(parsePattern("{ id, tags: [first, ...rest] }")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["id", "first", "rest"]);
  });

  test("an array without a rest binds its items' names only", () => {
    expect(namesOf(parsePattern("[a, b]")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["a", "b"]);
  });

  test("a pattern that binds nothing has no names", () => {
    expect(namesOf(parsePattern("1")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual([]);
  });
});

describe("parsePattern: the remaining patterns", () => {
  test("alternatives are the options, each a pattern, and bind no names", () => {
    expect(parsePattern(`"a" | "b"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] });
    expect(parsePattern(`"a|b"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "value", value: "a|b" });
    expect(parsePattern("name | 1")
      .isLeft())
      .toBe(true);
  });

  test("alternatives that bind the same names parse, and share those names", () => {
    expect(namesOf(parsePattern(`{ status: "ok", value } | { status: "cached", value }`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["value"]);
    expect(parsePattern(`{ status: "ok", value } | { status: "cached", value: x }`)
      .isLeft())
      .toBe(true);
  });

  test("a range takes two numbers, the smaller first", () => {
    expect(parsePattern("0..12")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "range", min: 0, max: 12 });
    expect(parsePattern("-1.5..2")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "range", min: -1.5, max: 2 });
    expect(parsePattern("5..1")
      .isLeft())
      .toBe(true);
  });

  test("an open range has one bound, and no key for the missing one", () => {
    expect(parsePattern("18..")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "range", min: 18 });
    expect(parsePattern("..100")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "range", max: 100 });
    expect(Object.keys(parsePattern("18..")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["kind", "min"]);
    expect(parsePattern("..")
      .isLeft())
      .toBe(true);
  });

  test("not takes a pattern, which binds no names", () => {
    expect(parsePattern(`not "guest"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "not", pattern: { kind: "value", value: "guest" } });
    expect(parsePattern("not name")
      .isLeft())
      .toBe(true);
  });

  test("present and absent are words; absent only names a key's pattern", () => {
    expect(parsePattern("present")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "present" });
    expect(parsePattern("absent")
      .isLeft())
      .toBe(true);
    expect(parsePattern("{ error: absent }")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "object", fields: [{ key: "error", pattern: { kind: "absent" } }] });
  });

  test("not on its own is still a name, and a name inside a word is not not", () => {
    expect(parsePattern("not")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "bind", name: "not" });
    expect(parsePattern("knot")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "bind", name: "knot" });
  });
});

describe("parsePattern: as-patterns", () => {
  test("`as name` binds the whole value, next to the pattern's own names", () => {
    expect(parsePattern("{ id, name } as user")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({
        kind: "as",
        name: "user",
        pattern: {
          kind: "object",
          fields: [{ key: "id", pattern: { kind: "bind", name: "id" } }, { key: "name", pattern: { kind: "bind", name: "name" } }],
        },
      });
    expect(namesOf(parsePattern("{ id, name } as user")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["id", "name", "user"]);
  });

  test("the alias covers the whole pattern, alternatives included", () => {
    expect(parsePattern(`"a" | "b" as s`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({
        kind: "as",
        name: "s",
        pattern: { kind: "alt", options: [{ kind: "value", value: "a" }, { kind: "value", value: "b" }] },
      });
  });

  test("an array with a rest can be aliased", () => {
    expect(namesOf(parsePattern("[first, ...rest] as list")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["first", "rest", "list"]);
  });

  test("` as ` inside braces, brackets, parentheses or quotes is not an alias", () => {
    expect(parsePattern("{ as }")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "object", fields: [{ key: "as", pattern: { kind: "bind", name: "as" } }] });
    expect(parsePattern(`"x as y"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "value", value: "x as y" });
    expect(namesOf(parsePattern("some(x as y)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
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
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["id", "u"]);
  });
});

describe("parsePattern: tuples", () => {
  test("(a, b) is the array pattern [a, b]", () => {
    expect(parsePattern("(a, b)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual(parsePattern("[a, b]")
        .match({
          left: (error) => {
            throw error;
          },
          right: (value) => value,
        }));
    expect(namesOf(parsePattern("(x, y, z)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["x", "y", "z"]);
  });

  test("a tuple takes a rest, an empty tuple is the empty array, and a trailing comma keeps a tuple of one", () => {
    expect(namesOf(parsePattern("(first, ...rest)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["first", "rest"]);
    expect(parsePattern("()")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "array", items: [] });
    expect(parsePattern("(1,)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "array", items: [{ kind: "value", value: 1 }] });
  });

  test("one pattern in parentheses, with no comma, is that pattern", () => {
    expect(parsePattern("(a)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "bind", name: "a" });
    expect(parsePattern("(1 | 2)")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual(parsePattern("1 | 2")
        .match({
          left: (error) => {
            throw error;
          },
          right: (value) => value,
        }));
  });

  test("a parenthesis inside a string does not close the group", () => {
    expect(namesOf(parsePattern(`(")", b)`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["b"]);
  });

  test("a tuple takes objects and arrays inside, and an alias names the whole tuple", () => {
    expect(namesOf(parsePattern("({ id }, [x]) as pair")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["id", "x", "pair"]);
    expect(parsePattern("(1, 2")
      .isLeft())
      .toBe(true);
  });
});

describe("parsePattern: regex patterns", () => {
  test("a regex literal is one pattern, with its source and flags", () => {
    expect(parsePattern(String.raw`/^\d+$/`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "regex", source: String.raw`^\d+$`, flags: "", names: [] });
    expect(parsePattern("/ab/i")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "regex", source: "ab", flags: "i", names: [] });
  });

  test("named groups are the names the pattern binds", () => {
    expect(namesOf(parsePattern(String.raw`/(?<id>\d+)-(?<tag>\w+)?/`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["id", "tag"]);
  });

  test("a bar, a slash in a class, and an escaped slash stay inside the literal", () => {
    expect(parsePattern("/a|b/")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "regex", source: "a|b", flags: "", names: [] });
    expect(parsePattern("/[/]/")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "regex", source: "[/]", flags: "", names: [] });
    expect(parsePattern(String.raw`/a\/b/`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "regex", source: String.raw`a\/b`, flags: "", names: [] });
  });

  test("a regex can be aliased, and can sit under not", () => {
    expect(namesOf(parsePattern("/x/ as whole")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["whole"]);
    expect(parsePattern("not /x/")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
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
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
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

describe("parsePattern: escaped quotes", () => {
  test("an escaped quote does not close a string, so a bar inside it is text", () => {
    expect(parsePattern(String.raw`"a\"|b"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "value", value: `a"|b` });
    expect(parsePattern(String.raw`"\")" | "a"`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ kind: "alt", options: [{ kind: "value", value: `")` }, { kind: "value", value: "a" }] });
  });

  test("an escaped quote does not end a string before `when`, a bracket or `as`", () => {
    expect(splitGuard(String.raw`"x\" when y" when z`))
      .toEqual({ pattern: String.raw`"x\" when y"`, guard: "z" });
    expect(namesOf(parsePattern(String.raw`("\")", b)`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["b"]);
    expect(namesOf(parsePattern(String.raw`"\" as x" as y`)
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["y"]);
  });
});

describe("parsePattern: duplicate names", () => {
  test("a name bound twice in one pattern is an error, whatever its shape", () => {
    for (const text of ["[a, a]", "{ a, b: a }", "(a, a)", "[a, [a]]", "{ k: { a }, j: [a] }", "{ a, b: a } as c"]) {
      expect(parsePattern(text)
        .isLeft(), text)
        .toBe(true);
    }
    expect(parsePattern("[a, a]")
      .match({ left: (error) => error.message, right: () => "" }))
      .toContain(`The name "a" is bound twice`);
  });

  test("distinct names, and alternatives that bind the same names, are not duplicates", () => {
    expect(namesOf(parsePattern("[a, b]")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      })))
      .toEqual(["a", "b"]);
    expect(parsePattern("{ a } | { a }")
      .isRight())
      .toBe(true);
  });
});

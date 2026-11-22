import { describe, expect, test } from "vitest";
import { None, Some } from "@tinker/functional/v1";
import { match as readBox, Left, Right, type Either } from "@tinker/functional/v1";
import { parsePattern } from "../template/pattern.ts";
import { match } from "./match-binding.ts";

/** Whether `text` as a pattern matches `value`. */
function matches(text: string, value: unknown): boolean {
  return match(readBox(parsePattern(text), { Left: (error) => {
    throw error;
  }, Right: (value) => value }), value) !== undefined;
}

describe("match", () => {
  test("present matches anything but null and undefined", () => {
    expect(matches("present", 0))
      .toBe(true);
    expect(matches("present", null))
      .toBe(false);
    expect(matches("present", undefined))
      .toBe(false);
  });

  test("alternatives match when one option does", () => {
    expect(matches(`"loading" | "saving"`, "saving"))
      .toBe(true);
    expect(matches(`"loading" | "saving"`, "idle"))
      .toBe(false);
    expect(matches(`number | null`, null))
      .toBe(true);
  });

  test("a range matches the numbers from its smaller to its larger end, inclusive", () => {
    expect(matches("0..12", 0))
      .toBe(true);
    expect(matches("0..12", 12))
      .toBe(true);
    expect(matches("0..12", 13))
      .toBe(false);
    expect(matches("0..12", "5"))
      .toBe(false);
  });

  test("an open range has one end: 18.. is 18 and above, ..100 is 100 and below", () => {
    expect(matches("18..", 18))
      .toBe(true);
    expect(matches("18..", 17))
      .toBe(false);
    expect(matches("18..", 1e9))
      .toBe(true);
    expect(matches("..100", 100))
      .toBe(true);
    expect(matches("..100", -5))
      .toBe(true);
    expect(matches("..100", 101))
      .toBe(false);
    expect(matches("..100", "5"))
      .toBe(false);
  });

  test("alternatives that bind the same names bind them from the option that matched", () => {
    const ok = match(readBox(parsePattern(`{ status: "ok", value } | { status: "cached", value }`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), { status: "cached", value: 3 });
    expect(ok)
      .toEqual(new Map<string, unknown>([["value", 3]]));
    expect(matches(`{ status: "ok", value } | { status: "cached", value }`, { status: "saving", value: 1 }))
      .toBe(false);
  });

  test("an alias over alternatives binds the whole value, and the shared names", () => {
    const bound = match(readBox(parsePattern(`{ id } | { key: id } as item`), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), { key: 9 });
    expect(bound)
      .toEqual(new Map<string, unknown>([["id", 9], ["item", { key: 9 }]]));
  });

  test("not matches what its pattern does not", () => {
    expect(matches(`not "guest"`, "ana"))
      .toBe(true);
    expect(matches(`not "guest"`, "guest"))
      .toBe(false);
  });

  test("absent alone never matches, since a value is not absent by itself", () => {
    expect(match({ kind: "absent" }, undefined))
      .toBeUndefined();
  });

  test("an absent key matches an object without the key, and only that", () => {
    expect(matches("{ error: absent }", {}))
      .toBe(true);
    expect(matches("{ error: absent }", { error: undefined }))
      .toBe(false);
    expect(matches("{ error: absent }", "not an object"))
      .toBe(false);
  });

  test("an array pattern with a rest needs at least its items", () => {
    expect(matches("[first, ...rest]", [1, 2]))
      .toBe(true);
    expect(matches("[first, ...rest]", []))
      .toBe(false);
    expect(matches("[first, ...rest]", "x"))
      .toBe(false);
  });
});

describe("match: Maybe and Either", () => {
  test("some matches a Maybe with a value, and binds its payload", () => {
    const bound = match(readBox(parsePattern("some(name)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), Some.of("Ada"));
    expect(bound)
      .toEqual(new Map([["name", "Ada"]]));
    expect(matches("some(_)", None.of()))
      .toBe(false);
  });

  test("none matches an empty Maybe, and not a value", () => {
    expect(matches("none", None.of()))
      .toBe(true);
    expect(matches("none", Some.of(1)))
      .toBe(false);
    expect(matches("none", null))
      .toBe(false);
  });

  test("the payload of some must match its pattern", () => {
    expect(matches("some(1)", Some.of(1)))
      .toBe(true);
    expect(matches("some(1)", Some.of(2)))
      .toBe(false);
  });

  test("ok matches a Right and binds its value; error matches a Left and binds its error", () => {
    expect(match(readBox(parsePattern("ok(n)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), Right.of(3)))
      .toEqual(new Map([["n", 3]]));
    expect(match(readBox(parsePattern("error(e)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), Left.of("down")))
      .toEqual(new Map([["e", "down"]]));
    expect(matches("ok(_)", Left.of("down")))
      .toBe(false);
    expect(matches("error(_)", Right.of(3)))
      .toBe(false);
    expect(matches("error(_)", 3))
      .toBe(false);
    expect(matches("ok(_)", 3))
      .toBe(false);
  });

  test("a wrapper matches only its own kind, not a plain value", () => {
    expect(matches("some(_)", "text"))
      .toBe(false);
    expect(matches("ok(_)", Some.of(1)))
      .toBe(false);
  });

  test("alternatives must bind the same names, or none", () => {
    expect(() => readBox(parsePattern("some(a) | none"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow("Alternatives must bind the same names, or none");
    expect(() => readBox(parsePattern("{ a } | { b }"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow("Alternatives must bind the same names, or none");
    expect(() => readBox(parsePattern("not ok(a)"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow("\"not\" cannot bind names");
  });
});

describe("match: as-patterns", () => {
  test("an alias binds the whole value, and the pattern's names too", () => {
    const user = { id: 7, name: "Ada" };
    expect(match(readBox(parsePattern("{ id, name } as user"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), user))
      .toEqual(new Map<string, unknown>([["id", 7], ["name", "Ada"], ["user", user]]));
  });

  test("an alias matches only when its pattern does", () => {
    expect(matches("{ id } as user", { name: "Ada" }))
      .toBe(false);
    expect(matches("[first, ...rest] as list", []))
      .toBe(false);
    expect(matches("[first, ...rest] as list", [1, 2]))
      .toBe(true);
  });

  test("an alias binds the value of an alias that matches nothing else", () => {
    expect(match(readBox(parsePattern("_ as any"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), 5))
      .toEqual(new Map([["any", 5]]));
    expect(match(readBox(parsePattern("some(x) as m"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), Some.of(3)))
      .toEqual(new Map<string, unknown>([["x", 3], ["m", Some.of(3)]]));
  });
});

describe("match: tuples", () => {
  test("a tuple matches an array of exactly its length", () => {
    expect(matches("(a, b)", [1, 2]))
      .toBe(true);
    expect(matches("(a, b)", [1]))
      .toBe(false);
    expect(matches("(a, b)", [1, 2, 3]))
      .toBe(false);
    expect(matches("(a, { id })", [1, { id: 4 }]))
      .toBe(true);
  });
});

describe("match: regex patterns", () => {
  test("a regex matches a string, and not another value", () => {
    expect(matches(String.raw`/^\d+$/`, "42"))
      .toBe(true);
    expect(matches(String.raw`/^\d+$/`, "x1"))
      .toBe(false);
    expect(matches(String.raw`/^\d+$/`, 42))
      .toBe(false);
  });

  test("named groups bind the group's text, or undefined when it did not take part", () => {
    const pattern = readBox(parsePattern(String.raw`/(?<id>\d+)-(?<tag>\w+)?/`), { Left: (error) => {
      throw error;
    }, Right: (value) => value });
    expect(match(pattern, "12-"))
      .toEqual(new Map<string, unknown>([["id", "12"], ["tag", undefined]]));
    expect(match(pattern, "12-ok"))
      .toEqual(new Map<string, unknown>([["id", "12"], ["tag", "ok"]]));
  });

  test("a regex without groups binds nothing, and an alias binds the string", () => {
    expect(match(readBox(parsePattern("/a/"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), "a"))
      .toEqual(new Map());
    expect(match(readBox(parsePattern("/(?<x>a)/ as s"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), "a"))
      .toEqual(new Map<string, unknown>([["x", "a"], ["s", "a"]]));
  });
});

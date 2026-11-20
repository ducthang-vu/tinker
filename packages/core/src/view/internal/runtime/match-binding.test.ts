import { describe, expect, test } from "vitest";
import { Either, Maybe } from "@tinker/functional";
import { parsePattern } from "../template/pattern.ts";
import { match } from "./match-binding.ts";

/** Whether `text` as a pattern matches `value`. */
function matches(text: string, value: unknown): boolean {
  return match(parsePattern(text)
    .getOrThrow(), value) !== undefined;
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
    const bound = match(parsePattern("some(name)")
      .getOrThrow(), Maybe.some("Ada"));
    expect(bound)
      .toEqual(new Map([["name", "Ada"]]));
    expect(matches("some(_)", Maybe.none()))
      .toBe(false);
  });

  test("none matches an empty Maybe, and not a value", () => {
    expect(matches("none", Maybe.none()))
      .toBe(true);
    expect(matches("none", Maybe.some(1)))
      .toBe(false);
    expect(matches("none", null))
      .toBe(false);
  });

  test("the payload of some must match its pattern", () => {
    expect(matches("some(1)", Maybe.some(1)))
      .toBe(true);
    expect(matches("some(1)", Maybe.some(2)))
      .toBe(false);
  });

  test("ok matches a Right and binds its value; error matches a Left and binds its error", () => {
    expect(match(parsePattern("ok(n)")
      .getOrThrow(), Either.right(3)))
      .toEqual(new Map([["n", 3]]));
    expect(match(parsePattern("error(e)")
      .getOrThrow(), Either.left("down")))
      .toEqual(new Map([["e", "down"]]));
    expect(matches("ok(_)", Either.left("down")))
      .toBe(false);
    expect(matches("error(_)", Either.right(3)))
      .toBe(false);
  });

  test("a wrapper matches only its own kind, not a plain value", () => {
    expect(matches("some(_)", "text"))
      .toBe(false);
    expect(matches("ok(_)", Maybe.some(1)))
      .toBe(false);
  });

  test("a wrapper binds names, so they can be alternatives' only if none", () => {
    expect(() => parsePattern("some(a) | none")
      .getOrThrow())
      .toThrow("Alternatives cannot bind names");
    expect(() => parsePattern("not ok(a)")
      .getOrThrow())
      .toThrow("\"not\" cannot bind names");
  });
});

describe("match: as-patterns", () => {
  test("an alias binds the whole value, and the pattern's names too", () => {
    const user = { id: 7, name: "Ada" };
    expect(match(parsePattern("{ id, name } as user")
      .getOrThrow(), user))
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
    expect(match(parsePattern("_ as any")
      .getOrThrow(), 5))
      .toEqual(new Map([["any", 5]]));
    expect(match(parsePattern("some(x) as m")
      .getOrThrow(), Maybe.some(3)))
      .toEqual(new Map<string, unknown>([["x", 3], ["m", Maybe.some(3)]]));
  });
});

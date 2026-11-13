import { describe, expect, test } from "vitest";
import { type Expression, ExpressionParser } from "./expression.ts";

/** Parse, failing the test on an error. */
function parse(source: string): Expression {
  return ExpressionParser.parse(source)
    .getOrThrow();
}

/** The error message for `source`. */
function error(source: string): string {
  return ExpressionParser.parse(source)
    .match({ left: (e) => e.message, right: () => "no error" });
}

const component = { kind: "component" } as const;

describe("ExpressionParser", () => {
  test("a bare name is a field of the component", () => {
    expect(parse("title"))
      .toEqual({ kind: "property", receiver: component, name: "title" });
  });

  test("a call without arguments", () => {
    expect(parse("count()"))
      .toEqual({
        kind: "call",
        callee: { kind: "property", receiver: component, name: "count" },
      });
  });

  test("fields and calls chain, left to right", () => {
    expect(parse("user().name"))
      .toEqual({
        kind: "property",
        receiver: { kind: "call", callee: { kind: "property", receiver: component, name: "user" } },
        name: "name",
      });
    expect(parse("a.b()()"))
      .toEqual({
        kind: "call",
        callee: {
          kind: "call",
          callee: { kind: "property", receiver: { kind: "property", receiver: component, name: "a" }, name: "b" },
        },
      });
  });

  test("allows whitespace around names, dots and parentheses", () => {
    expect(parse("  user ( ) . name  "))
      .toEqual(parse("user().name"));
  });

  test("names may contain $, _ and digits (not first)", () => {
    expect(parse("$item_2"))
      .toEqual({ kind: "property", receiver: component, name: "$item_2" });
  });

  test("reports what is not supported, with the column", () => {
    expect(error(""))
      .toBe(`Empty expression: write a field or a call, e.g. "title" or "count()"`);
    expect(error("   "))
      .toMatch(/^Empty expression/);
    expect(error("a + b"))
      .toBe(`Unexpected "+": only fields and calls are supported for now (at column 3 in "a + b")`);
    expect(error("count(1)"))
      .toBe(`Call arguments are not supported yet (at column 7 in "count(1)")`);
    expect(error("count("))
      .toBe(`Missing ")" (at column 7 in "count(")`);
    expect(error("user."))
      .toBe(`Missing a name at the end (at column 6 in "user.")`);
    expect(error("user.1"))
      .toBe(`Expected a name, found "1" (at column 6 in "user.1")`);
    expect(error("1"))
      .toBe(`Expected a name, found "1" (at column 1 in "1")`);
    expect(error("'text'"))
      .toMatch(/^Expected a name, found "'"/);
  });
});

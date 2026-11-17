import { describe, expect, test } from "vitest";
import { type Expression, ExpressionParser } from "./expression.ts";

/** Parse, failing the test on an error. */
function parse(source: string): Expression {
  return ExpressionParser.parse(source)
    .getOrThrow();
}

/** The error message for `source`. */
function parsed(source: string) {
  return ExpressionParser.parse(source)
    .getOrThrow();
}

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
    expect(error("a ? b"))
      .toBe(`Missing ":" in the conditional (at column 6 in "a ? b")`);
    expect(error("count(1)"))
      .toBe(`Call arguments are not supported yet (at column 7 in "count(1)")`);
    expect(error("count("))
      .toBe(`Missing ")" (at column 7 in "count(")`);
    expect(error("user."))
      .toBe(`Missing a name at the end (at column 6 in "user.")`);
    expect(error("user.1"))
      .toBe(`Expected a name, found "1" (at column 6 in "user.1")`);
    expect(error("1 2"))
      .toBe(`Unexpected "2" (at column 3 in "1 2")`);
    expect(error("#tag"))
      .toMatch(/^Expected a name, found "#"/);
  });

  test("reports an operator with a missing operand, or an unclosed group", () => {
    expect(error("1 +"))
      .toBe(`Missing a name at the end (at column 4 in "1 +")`);
    expect(error("1 ** "))
      .toBe(`Missing a name at the end (at column 6 in "1 ** ")`);
    expect(error("(1 + 2"))
      .toBe(`Missing ")" (at column 7 in "(1 + 2")`);
    expect(error("(1 2)"))
      .toBe(`Expected ")", found "2" (at column 4 in "(1 2)")`);
  });

  test("reads string and keyword literals", () => {
    expect(parsed("\"loading\""))
      .toEqual({ kind: "literal", value: "loading" });
    expect(parsed("'it'"))
      .toEqual({ kind: "literal", value: "it" });
    expect(parsed("\"say \\\"hi\\\"\\n\""))
      .toEqual({ kind: "literal", value: "say \"hi\"\n" });
    expect(parsed("\"a\\tb\""))
      .toEqual({ kind: "literal", value: "a\tb" });
    expect(parsed("true"))
      .toEqual({ kind: "literal", value: true });
    expect(parsed("false"))
      .toEqual({ kind: "literal", value: false });
    expect(parsed("null"))
      .toEqual({ kind: "literal", value: null });
    expect(parsed("undefined"))
      .toEqual({ kind: "literal", value: undefined });
  });

  test("a name that starts with a keyword is still a name", () => {
    expect(parsed("trueValue"))
      .toEqual({ kind: "property", receiver: { kind: "component" }, name: "trueValue" });
  });

  test("reports an unclosed string", () => {
    expect(error("\"open"))
      .toBe(`Missing closing " (at column 6 in ""open")`);
  });

  test("reports a comparison or logical operator with a missing operand", () => {
    expect(error("a <"))
      .toBe(`Missing a name at the end (at column 4 in "a <")`);
    expect(error("a &&"))
      .toBe(`Missing a name at the end (at column 5 in "a &&")`);
    expect(error("!"))
      .toBe(`Missing a name at the end (at column 2 in "!")`);
  });
});

describe("the conditional operator: parsing", () => {
  test("a conditional has a test, a then and an otherwise", () => {
    expect(parse("a ? b : c"))
      .toMatchObject({ kind: "conditional", test: { kind: "property" }, then: { kind: "property" } });
  });

  test("a missing ':' is an error that says so", () => {
    expect(ExpressionParser.parse("a ? b")
      .isLeft())
      .toBe(true);
    expect(ExpressionParser.parse("a ? b c")
      .isLeft())
      .toBe(true);
  });
});

describe("the new expression forms: parsing errors", () => {
  test("an unclosed object or array, or a missing comma, is an error", () => {
    expect(ExpressionParser.parse("{ a: 1")
      .isLeft())
      .toBe(true);
    expect(ExpressionParser.parse("[1, 2")
      .isLeft())
      .toBe(true);
    expect(ExpressionParser.parse("{ a: 1 b: 2 }")
      .isLeft())
      .toBe(true);
    expect(ExpressionParser.parse("[1 2]")
      .isLeft())
      .toBe(true);
  });

  test("a quoted key needs a value", () => {
    expect(ExpressionParser.parse("{ 'a' }")
      .isLeft())
      .toBe(true);
  });
});

describe("unterminated object and array literals", () => {
  test("an object or an array that runs out of input is an error", () => {
    expect(ExpressionParser.parse("{")
      .isLeft())
      .toBe(true);
    expect(ExpressionParser.parse("[")
      .isLeft())
      .toBe(true);
  });
});

test("a ?. at the end of the input is an error, not a link", () => {
  expect(ExpressionParser.parse("a?.")
    .isLeft())
    .toBe(true);
});

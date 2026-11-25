import { describe, expect, test } from "vitest";
import { type Expression, ExpressionParser } from "./expression.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

/** Parse, failing the test on an error. */
function parse(source: string): Expression {
  return valueOrThrow(ExpressionParser.parse(source));
}

/** The error message for `source`. */
function parsed(source: string) {
  return valueOrThrow(ExpressionParser.parse(source));
}

function error(source: string): string {
  return match(ExpressionParser.parse(source), { Left: (e) => e.message, Right: () => "no error" });
}

const component = { kind: "component" } as const;

describe("ExpressionParser", () => {
  test("a minus before an operand is negation, which binds to the operand alone", () => {
    expect(parse("-count() * 2"))
      .toEqual({
        kind: "binary",
        operator: "*",
        left: { kind: "negate", operand: parse("count()") },
        right: { kind: "literal", value: 2 },
      });
    expect(parse("3 - 1"))
      .toEqual({ kind: "binary", operator: "-", left: { kind: "literal", value: 3 }, right: { kind: "literal", value: 1 } });
  });

  test("a bare name is a field of the component", () => {
    expect(parse("title"))
      .toEqual({ kind: "property", receiver: component, name: "title" });
  });

  test("a call without arguments", () => {
    expect(parse("count()"))
      .toEqual({
        kind: "call",
        callee: { kind: "property", receiver: component, name: "count" },
        args: [],
      });
  });

  test("fields and calls chain, left to right", () => {
    expect(parse("user().name"))
      .toEqual({
        kind: "property",
        receiver: {
          kind: "call",
          callee: { kind: "property", receiver: component, name: "user" },
          args: [],
        },
        name: "name",
      });
    expect(parse("a.b()()"))
      .toEqual({
        kind: "call",
        callee: {
          kind: "call",
          callee: { kind: "property", receiver: { kind: "property", receiver: component, name: "a" }, name: "b" },
          args: [],
        },
        args: [],
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
    expect(error("count(1 2)"))
      .toBe(`Expected "," or ")", found "2" (at column 9 in "count(1 2)")`);
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
    expect(match(ExpressionParser.parse("a ? b"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(ExpressionParser.parse("a ? b c"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });
});

describe("the new expression forms: parsing errors", () => {
  test("an unclosed object or array, or a missing comma, is an error", () => {
    expect(match(ExpressionParser.parse("{ a: 1"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(ExpressionParser.parse("[1, 2"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(ExpressionParser.parse("{ a: 1 b: 2 }"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(ExpressionParser.parse("[1 2]"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });

  test("a quoted key needs a value", () => {
    expect(match(ExpressionParser.parse("{ 'a' }"), { Left: () => true, Right: () => false }))
      .toBe(true);
  });
});

describe("unterminated object and array literals", () => {
  test("an object or an array that runs out of input is an error", () => {
    expect(match(ExpressionParser.parse("{"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(ExpressionParser.parse("["), { Left: () => true, Right: () => false }))
      .toBe(true);
  });
});

test("a ?. at the end of the input is an error, not a link", () => {
  expect(match(ExpressionParser.parse("a?."), { Left: () => true, Right: () => false }))
    .toBe(true);
});

test("an argument list that ends early is an error that says so", () => {
  expect(error("count(1"))
    .toBe(`Expected "," or ")", found "the end" (at column 8 in "count(1")`);
});

describe("pipes: parsing", () => {
  test("a pipe is a call of the named function, with the value as its first argument", () => {
    expect(parse("price | format(locale)"))
      .toEqual({
        kind: "call",
        callee: { kind: "property", receiver: component, name: "format" },
        args: [parse("price"), parse("locale")],
      });
  });

  test("a pipe without arguments passes only the value", () => {
    expect(parse("price | double"))
      .toEqual({
        kind: "call",
        callee: { kind: "property", receiver: component, name: "double" },
        args: [parse("price")],
      });
  });

  test("pipes go from left to right, and bind looser than any operator", () => {
    expect(parse("a + b | f | g"))
      .toEqual(parse("g(f(a + b))"));
  });

  test("|| is still the logical operator", () => {
    expect(parse("a || b"))
      .toEqual({ kind: "binary", operator: "||", left: parse("a"), right: parse("b") });
  });

  test("inside the arguments of a call, a pipe needs parentheses", () => {
    expect(error("f(a | g)"))
      .not
      .toBe("no error");
    expect(parse("f((a | g))"))
      .toEqual(parse("f(g(a))"));
  });

  test("a pipe with no name is an error", () => {
    expect(error("price |"))
      .not
      .toBe("no error");
  });
});

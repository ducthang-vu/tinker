import { describe, expect, test } from "vitest";
import { parseNodes } from "../test-support.ts";
import { type CompiledMatch, type CompiledNode, compileTemplate as compileTemplateEither } from "./compile.ts";

const compileTemplate = (...args: Parameters<typeof compileTemplateEither>) =>
  valueOrThrow(compileTemplateEither(...args));
import { ExpressionParser } from "./expression.ts";
import { itemsOf } from "./blocks.ts";
import { TemplateCompileError } from "./compile-error.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

function compile(source: string): readonly CompiledNode[] {
  return compileTemplate(parseNodes(source));
}

function onlyMatch(source: string): CompiledMatch {
  const node = compile(source)
    .find((candidate) => candidate.kind === "match");
  expect(node)
    .toBeDefined();
  return node as CompiledMatch;
}

const expression = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("@if and @else", () => {
  test("@if is a match with one truthy case, and no default", () => {
    const match = onlyMatch("@if (user()) { <p>Hi</p> }");
    expect(match.subject)
      .toEqual(expression("user()"));
    expect(match.cases)
      .toHaveLength(1);
    expect(match.cases[0]!.pattern)
      .toEqual({ kind: "truthy" });
    expect(match.cases[0]!.body.map((node) => node.kind))
      .toEqual(["text", "element", "text"]);
    expect(match.default)
      .toBeUndefined();
  });

  test("@else is the default of the match", () => {
    const match = onlyMatch("@if (a()) { <p>A</p> } @else { <p>B</p> }");
    expect(match.default!.map((node) => node.kind))
      .toEqual(["text", "element", "text"]);
  });

  test("@else if nests another match as the default", () => {
    const match = onlyMatch("@if (a()) { A } @else if (b()) { B } @else { C }");
    const nested = match.default![0] as CompiledMatch;
    expect(nested.kind)
      .toBe("match");
    expect(nested.subject)
      .toEqual(expression("b()"));
    expect(nested.default)
      .toBeDefined();
  });

  test("text, interpolations and @let inside a block are compiled as usual", () => {
    const match = onlyMatch("@if (a()) { @let n = b(); {{ n }} }");
    expect(match.cases[0]!.body.map((node) => node.kind))
      .toEqual(["let", "text"]);
  });

  test("the condition must be in parentheses", () => {
    expect(() => compile("@if user() { x }"))
      .toThrow("@if needs a condition in parentheses");
  });

  test("an @else without an @if is an error", () => {
    expect(() => compile("@else { x }"))
      .toThrow("@else must follow an @if");
  });

  test("an @if that is not followed by @else is complete on its own", () => {
    expect(() => compile("@if (a()) { x } plain text"))
      .not.toThrow();
  });
});

describe("@match", () => {
  test("cases with each kind of pattern, and a default", () => {
    const match = onlyMatch(`
      @match state() {
        @case "loading" { L }
        @case 0 { Z }
        @case true { T }
        @case null { N }
        @case undefined { U }
        @case truthy { Y }
        @case falsy { F }
        @case _ { A }
        @default { D }
      }`);
    expect(match.cases.map((c) => c.pattern))
      .toEqual([
        { kind: "value", value: "loading" },
        { kind: "value", value: 0 },
        { kind: "value", value: true },
        { kind: "value", value: null },
        { kind: "value", value: undefined },
        { kind: "truthy" },
        { kind: "falsy" },
        { kind: "any" },
      ]);
    expect(match.default)
      .toBeDefined();
  });

  test("whitespace between cases is ignored", () => {
    const match = onlyMatch("@match a() {\n  @case 1 { x }\n\n  @case 2 { y }\n}");
    expect(match.cases)
      .toHaveLength(2);
  });

  test("a match without a subject takes only _ cases, with a when guard", () => {
    expect(() => compile("@match { @case 1 { x } }"))
      .toThrow("A @match without a subject takes \"@case _ when …\" cases");
    const match = onlyMatch("@match { @case _ when a() { x } @default { y } }");
    expect(match.subject)
      .toBeUndefined();
    expect(match.cases[0]!.guard)
      .toEqual(expression("a()"));
  });

  test("a guard follows the pattern, and needs a condition", () => {
    const match = onlyMatch("@match n() { @case 1 when ok() { x } }");
    expect(match.cases[0]!.pattern)
      .toEqual({ kind: "value", value: 1 });
    expect(match.cases[0]!.guard)
      .toEqual(expression("ok()"));
    expect(() => compile("@match n() { @case 1 when { x } }"))
      .toThrow("@case needs a value");
  });

  test("only @case and @default can be inside a match", () => {
    expect(() => compile("@match a() { <p>x</p> }"))
      .toThrow("Only @case and @default blocks can be inside @match");
    expect(() => compile("@match a() { @if (b()) { x } }"))
      .toThrow("Only @case and @default blocks can be inside @match");
  });

  test("a match has one default", () => {
    expect(() => compile("@match a() { @default { x } @default { y } }"))
      .toThrow("A @match has one @default");
  });

  test("a pattern must be a literal, truthy, falsy or _", () => {
    expect(() => compile("@match a() { @case b() { x } }"))
      .toThrow("Only literals, types, truthy, falsy, _ and names are patterns");
  });

  test("a case needs a pattern", () => {
    expect(() => compile("@match a() { @case when ok() { x } }"))
      .toThrow("@case needs a pattern");
  });

  test("@case and @default outside a match are errors", () => {
    expect(() => compile("@case 1 { x }"))
      .toThrow("@case must be inside @match");
    expect(() => compile("@default { x }"))
      .toThrow("@default must be inside @match");
  });
});

describe("the block syntax errors", () => {
  test("a block needs its opening brace", () => {
    expect(() => compile("@if (a())"))
      .toThrow("Missing \"{\" after \"@if\"");
  });

  test("a block needs its closing brace", () => {
    expect(() => compile("@if (a()) { <p>x</p>"))
      .toThrow("Missing \"}\" to close a block");
  });

  test("a closing brace needs a block", () => {
    expect(() => compile("text }"))
      .toThrow("Unexpected \"}\" with no block to close");
  });

  test("an interpolation that is never closed is an error, not a block", () => {
    expect(() => compile("@if (a()) { {{ b }"))
      .toThrow();
  });

  test("an interpolation is not a block: its braces are text", () => {
    expect(() => compile("{{ a }} @if (b()) { {{ c }} }"))
      .not.toThrow();
  });
});

describe("more block cases", () => {
  test("a block after an @if that is not an @else is kept as it is", () => {
    const match = onlyMatch("@if (a()) { x } @match b() { @case 1 { y } }");
    expect(match.default)
      .toBeUndefined();
  });

  test("a stray @else if is an error", () => {
    expect(() => compile("@else if (a()) { x }"))
      .toThrow("@else if must follow an @if");
  });

  test("an invalid expression in a block header is an error, naming the block", () => {
    expect(() => compile("@if (a +) { x }"))
      .toThrow("in @if");
  });
});

describe("relations and object patterns", () => {
  test("relations compare with a literal, and the five operators are read", () => {
    const match = onlyMatch("@match n() { @case >= 90 { a } @case !== 0 { b } @case < 5 { c } }");
    expect(match.cases.map((c) => c.pattern))
      .toEqual([
        { kind: "compare", operator: ">=", value: 90 },
        { kind: "compare", operator: "!==", value: 0 },
        { kind: "compare", operator: "<", value: 5 },
      ]);
  });

  test("a relation takes a literal, not a field or a call", () => {
    expect(() => compile("@match n() { @case >= score() { x } }"))
      .toThrow("A relation takes a literal");
  });

  test("an object pattern: keys with their patterns, or names alone", () => {
    const match = onlyMatch("@match r() { @case { status, index: number, kind: \"paid\" } { x } }");
    expect(match.cases[0]!.pattern)
      .toEqual({
        kind: "object",
        fields: [
          { key: "status", pattern: { kind: "bind", name: "status" } },
          { key: "index", pattern: { kind: "type", type: "number" } },
          { key: "kind", pattern: { kind: "value", value: "paid" } },
        ],
      });
  });

  test("an object pattern can contain an object pattern", () => {
    const match = onlyMatch("@match r() { @case { user: { role: \"admin\" } } { x } }");
    expect(match.cases[0]!.pattern)
      .toEqual({
        kind: "object",
        fields: [{
          key: "user",
          pattern: { kind: "object", fields: [{ key: "role", pattern: { kind: "value", value: "admin" } }] },
        }],
      });
  });

  test("an object pattern with a when guard", () => {
    const match = onlyMatch("@match r() { @case { status } when ok() { x } }");
    expect(match.cases[0]!.guard)
      .toEqual(expression("ok()"));
  });

  test("an object pattern: a missing brace, a bad key, or a key twice is an error", () => {
    expect(() => compile("@match r() { @case { a: 1 { x } }"))
      .toThrow("Missing \"{\" after \"@case\"");
    expect(() => compile("@match r() { @case { a: 1 "))
      .toThrow("Missing \"}\" in the pattern");
    expect(() => compile("@match r() { @case { a: 1, a: 2 } { x } }"))
      .toThrow("The key \"a\" is in the pattern twice");
    expect(() => compile("@match r() { @case { 1x } { x } }"))
      .toThrow("Expected a key in the pattern");
  });

  test("an object pattern: an empty value, a missing brace, and a trailing comma", () => {
    expect(() => compile("@match r() { @case { a: } { x } }"))
      .toThrow("A pattern is needed");
    expect(() => compile("@match r() { @case { a } x { y } }"))
      .toThrow("Missing \"}\" in the pattern");
    const match = onlyMatch("@match r() { @case { a, } { x } }");
    expect(match.cases[0]!.pattern)
      .toEqual({ kind: "object", fields: [{ key: "a", pattern: { kind: "bind", name: "a" } }] });
  });
});

describe("the body of a case with a parenthesized pattern", () => {
  test("braces inside the parentheses are part of the pattern, not the body", () => {
    const match = onlyMatch("@match v { @case some({ id }) { X } @case (a, { id }) { Y } @default { Z } }");
    expect(match.cases)
      .toHaveLength(2);
    expect(match.cases[0]!.body)
      .toHaveLength(1);
    expect(match.cases[0]!.body[0]!.kind)
      .toBe("text");
  });
});

describe("the spans of text split around a block", () => {
  test("each piece records the part of the source it covers", () => {
    const [first, block, last] = valueOrThrow(itemsOf(parseNodes("ab @if (x) { c } d")));
    expect(first)
      .toMatchObject({ kind: "text", value: "ab ", span: { start: 0, end: 3 } });
    expect(block)
      .toMatchObject({ kind: "block" });
    expect(last)
      .toMatchObject({ kind: "text", value: " d", span: { start: 16, end: 18 } });
  });

  test("a text node built by hand has no spans", () => {
    const [text] = valueOrThrow(itemsOf([{ kind: "text", value: "a @if (x) { b }" }]));
    expect(text)
      .toMatchObject({ kind: "text", value: "a " });
    expect((text as { span?: unknown }).span)
      .toBeUndefined();
  });
});

describe("the place of a block error", () => {
  const blockError = (source: string): TemplateCompileError => {
    try {
      valueOrThrow(itemsOf(parseNodes(source)));
    } catch (error) {
      return error as TemplateCompileError;
    }
    throw new Error(`no error for ${JSON.stringify(source)}`);
  };

  test("a block with no opening brace is located at its keyword", () => {
    const error = blockError("x @if y");
    expect(error)
      .toBeInstanceOf(TemplateCompileError);
    expect(error.message)
      .toBe(`Missing "{" after "@if"`);
    expect(error.span)
      .toEqual({ start: 2, end: 5 });
  });

  test("a block that is never closed is located at its opening brace", () => {
    const error = blockError("ab @if (x) { c");
    expect(error.message)
      .toBe(`Missing "}" to close a block`);
    expect(error.span)
      .toEqual({ start: 3, end: 12 });
  });

  test("a closing brace with no block is located at the brace", () => {
    const error = blockError("a } b");
    expect(error.message)
      .toBe(`Unexpected "}" with no block to close`);
    expect(error.span)
      .toEqual({ start: 2, end: 3 });
  });

  test("a pattern that is never closed is located at the block", () => {
    const error = blockError("@match v { @case [a { X } }");
    expect(error)
      .toBeInstanceOf(TemplateCompileError);
    expect(error.message)
      .toContain("in the pattern");
  });

  test("a block in a tree built by hand has no place, so its error is a plain error", () => {
    let thrown: unknown;
    try {
      valueOrThrow(itemsOf([{ kind: "text", value: "a @if (x) { c" }]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown)
      .not.toBeInstanceOf(TemplateCompileError);
    expect((thrown as Error).message)
      .toBe(`Missing "}" to close a block`);
  });

  test("a block's span runs from its keyword to its closing brace", () => {
    const [, block] = valueOrThrow(itemsOf(parseNodes("ab @if (x) { c } d")));
    expect(block)
      .toMatchObject({ kind: "block", span: { start: 3, end: 16 } });
  });

  test("an @else with no @if is located in the template, for the compiler's error", () => {
    const error = (() => {
      try {
        compileTemplate(parseNodes("<p>\n@else { x }</p>"));
      } catch (caught) {
        return caught as TemplateCompileError;
      }
      throw new Error("no error");
    })();
    expect(error.message)
      .toBe("@else must follow an @if");
    expect(error.span)
      .toEqual({ start: 4, end: 15 });
  });
});

describe("the body of a case with a regex pattern", () => {
  test("braces and bars inside a regex are not the body or alternatives", () => {
    const match = onlyMatch(String.raw`@match v { @case /\{|\}/ { X } @default { Y } }`);
    expect(match.cases)
      .toHaveLength(1);
    expect(match.cases[0]!.body[0]!.kind)
      .toBe("text");
  });
});

describe("the body of a case with an escaped quote in a pattern", () => {
  test("a brace inside a string is text, even after an escaped quote", () => {
    const match = onlyMatch(String.raw`@match v { @case { s: "\"}" } { X } @default { Y } }`);
    expect(match.cases)
      .toHaveLength(1);
    expect(match.cases[0]!.body[0]!.kind)
      .toBe("text");
  });
});

describe("an unclosed bracket in a case pattern", () => {
  test("is reported with the bracket it needs", () => {
    expect(() => compile("@match v { @case (1, 2 { x } }"))
      .toThrow("Missing \")\" in the pattern");
  });
});

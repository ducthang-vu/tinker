import { describe, expect, test } from "vitest";
import { BrowserTemplateParser } from "./browser-parser.ts";
import { type CompiledMatch, type CompiledNode, compileTemplate } from "./compile.ts";
import { ExpressionParser } from "./expression.ts";

function compile(source: string): readonly CompiledNode[] {
  return compileTemplate(new BrowserTemplateParser(document)
    .parse(source));
}

function onlyMatch(source: string): CompiledMatch {
  const node = compile(source)
    .find((candidate) => candidate.kind === "match");
  expect(node)
    .toBeDefined();
  return node as CompiledMatch;
}

const expression = (source: string) => ExpressionParser.parse(source)
  .getOrThrow();

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
      .toThrow("Only literals, truthy, falsy and _ are patterns for now");
  });

  test("a case needs a pattern", () => {
    expect(() => compile("@match a() { @case { x } }"))
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

import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { parseInterpolation } from "./interpolation.ts";
import { match, Left, Right } from "@tinker/functional/v1";

const expr = (source: string) => match(ExpressionParser.parse(source), { Left: (error) => {
  throw error;
}, Right: (value) => value });

describe("parseInterpolation", () => {
  test("text without {{ is one string and no expressions", () => {
    expect(match(parseInterpolation("plain text"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ strings: ["plain text"], expressions: [] });
    expect(match(parseInterpolation(""), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ strings: [""], expressions: [] });
  });

  test("splits text around each {{ }}, with one more string than expressions", () => {
    expect(match(parseInterpolation("Count: {{ count() }}!"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({
        strings: ["Count: ", "!"],
        expressions: [expr("count()")],
      });
    expect(match(parseInterpolation("{{a}}{{ b() }}"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({
        strings: ["", "", ""],
        expressions: [expr("a"), expr("b()")],
      });
  });

  test("a lone }} is plain text", () => {
    expect(match(parseInterpolation("a }} b"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toEqual({ strings: ["a }} b"], expressions: [] });
  });

  test("reports an unclosed {{", () => {
    expect(() => match(parseInterpolation("a {{ b() }} c {{ d"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow(
        `Unclosed "{{" in "a {{ b() }} c {{ d"`,
      );
  });

  test("reports the first invalid expression", () => {
    expect(() => match(parseInterpolation("{{ a b }} {{ c(1) }}"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow(`Unexpected "b"`);
    expect(() => match(parseInterpolation("{{ }}"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }))
      .toThrow("Empty expression");
  });
});

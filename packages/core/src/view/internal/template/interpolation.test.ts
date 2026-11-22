import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { parseInterpolation } from "./interpolation.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional/v1";

const expr = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("parseInterpolation", () => {
  test("text without {{ is one string and no expressions", () => {
    expect(valueOrThrow(parseInterpolation("plain text")))
      .toEqual({ strings: ["plain text"], expressions: [] });
    expect(valueOrThrow(parseInterpolation("")))
      .toEqual({ strings: [""], expressions: [] });
  });

  test("splits text around each {{ }}, with one more string than expressions", () => {
    expect(valueOrThrow(parseInterpolation("Count: {{ count() }}!")))
      .toEqual({
        strings: ["Count: ", "!"],
        expressions: [expr("count()")],
      });
    expect(valueOrThrow(parseInterpolation("{{a}}{{ b() }}")))
      .toEqual({
        strings: ["", "", ""],
        expressions: [expr("a"), expr("b()")],
      });
  });

  test("a lone }} is plain text", () => {
    expect(valueOrThrow(parseInterpolation("a }} b")))
      .toEqual({ strings: ["a }} b"], expressions: [] });
  });

  test("reports an unclosed {{", () => {
    expect(() => valueOrThrow(parseInterpolation("a {{ b() }} c {{ d")))
      .toThrow(
        `Unclosed "{{" in "a {{ b() }} c {{ d"`,
      );
  });

  test("reports the first invalid expression", () => {
    expect(() => valueOrThrow(parseInterpolation("{{ a b }} {{ c(1) }}")))
      .toThrow(`Unexpected "b"`);
    expect(() => valueOrThrow(parseInterpolation("{{ }}")))
      .toThrow("Empty expression");
  });
});

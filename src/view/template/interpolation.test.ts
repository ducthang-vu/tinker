import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { parseInterpolation } from "./interpolation.ts";

const expr = (source: string) => ExpressionParser.parse(source)
  .getOrThrow();

describe("parseInterpolation", () => {
  test("text without {{ is one string and no expressions", () => {
    expect(parseInterpolation("plain text")
      .getOrThrow())
      .toEqual({ strings: ["plain text"], expressions: [] });
    expect(parseInterpolation("")
      .getOrThrow())
      .toEqual({ strings: [""], expressions: [] });
  });

  test("splits text around each {{ }}, with one more string than expressions", () => {
    expect(parseInterpolation("Count: {{ count() }}!")
      .getOrThrow())
      .toEqual({
        strings: ["Count: ", "!"],
        expressions: [expr("count()")],
      });
    expect(parseInterpolation("{{a}}{{ b() }}")
      .getOrThrow())
      .toEqual({
        strings: ["", "", ""],
        expressions: [expr("a"), expr("b()")],
      });
  });

  test("a lone }} is plain text", () => {
    expect(parseInterpolation("a }} b")
      .getOrThrow())
      .toEqual({ strings: ["a }} b"], expressions: [] });
  });

  test("reports an unclosed {{", () => {
    expect(() => parseInterpolation("a {{ b() }} c {{ d")
      .getOrThrow())
      .toThrow(
        `Unclosed "{{" in "a {{ b() }} c {{ d"`,
      );
  });

  test("reports the first invalid expression", () => {
    expect(() => parseInterpolation("{{ a + b }} {{ c(1) }}")
      .getOrThrow())
      .toThrow(`Unexpected "+"`);
    expect(() => parseInterpolation("{{ }}")
      .getOrThrow())
      .toThrow("Empty expression");
  });
});

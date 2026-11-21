import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { parseInterpolation } from "./interpolation.ts";

const expr = (source: string) => ExpressionParser.parse(source)
  .match({
    left: (error) => {
      throw error;
    },
    right: (value) => value,
  });

describe("parseInterpolation", () => {
  test("text without {{ is one string and no expressions", () => {
    expect(parseInterpolation("plain text")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ strings: ["plain text"], expressions: [] });
    expect(parseInterpolation("")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ strings: [""], expressions: [] });
  });

  test("splits text around each {{ }}, with one more string than expressions", () => {
    expect(parseInterpolation("Count: {{ count() }}!")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({
        strings: ["Count: ", "!"],
        expressions: [expr("count()")],
      });
    expect(parseInterpolation("{{a}}{{ b() }}")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({
        strings: ["", "", ""],
        expressions: [expr("a"), expr("b()")],
      });
  });

  test("a lone }} is plain text", () => {
    expect(parseInterpolation("a }} b")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toEqual({ strings: ["a }} b"], expressions: [] });
  });

  test("reports an unclosed {{", () => {
    expect(() => parseInterpolation("a {{ b() }} c {{ d")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toThrow(
        `Unclosed "{{" in "a {{ b() }} c {{ d"`,
      );
  });

  test("reports the first invalid expression", () => {
    expect(() => parseInterpolation("{{ a b }} {{ c(1) }}")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toThrow(`Unexpected "b"`);
    expect(() => parseInterpolation("{{ }}")
      .match({
        left: (error) => {
          throw error;
        },
        right: (value) => value,
      }))
      .toThrow("Empty expression");
  });
});

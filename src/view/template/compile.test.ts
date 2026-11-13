import { describe, expect, test } from "vitest";
import { compileTemplate } from "./compile.ts";
import { ExpressionParser } from "./expression.ts";

describe("compileTemplate", () => {
  test("parses the {{ }} of every text, keeping elements and attributes", () => {
    const compiled = compileTemplate([
      {
        kind: "element",
        name: "p",
        attributes: [{ name: "class", value: "x" }],
        children: [{ kind: "text", value: "Hi {{ name() }}" }],
      },
      { kind: "text", value: "plain" },
    ]);
    expect(compiled).toEqual([
      {
        kind: "element",
        name: "p",
        attributes: [{ name: "class", value: "x" }],
        children: [
          {
            kind: "text",
            interpolation: { strings: ["Hi ", ""], expressions: [ExpressionParser.parse("name()").getOrThrow()] },
          },
        ],
      },
      { kind: "text", interpolation: { strings: ["plain"], expressions: [] } },
    ]);
  });

  test("throws for an invalid {{ }}, however deep", () => {
    expect(() =>
      compileTemplate([{ kind: "element", name: "div", attributes: [], children: [{ kind: "text", value: "{{ a(1) }}" }] }]),
    ).toThrow("Call arguments are not supported yet");
  });
});

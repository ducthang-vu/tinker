import { describe, expect, test } from "vitest";
import type { TemplateNode } from "./ast.ts";
import { type CompiledElement, compileTemplate } from "./compile.ts";
import { Selector } from "./selector.ts";
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
    expect(compiled)
      .toEqual([
        {
          kind: "element",
          name: "p",
          attributes: [{ name: "class", value: "x" }],
          children: [
            {
              kind: "text",
              interpolation: { strings: ["Hi ", ""], expressions: [ExpressionParser.parse("name()")
                .getOrThrow()] },
            },
          ],
          directives: [],
        },
        { kind: "text", interpolation: { strings: ["plain"], expressions: [] } },
      ]);
  });

  test("throws for an invalid {{ }}, however deep", () => {
    expect(() =>
      compileTemplate([{ kind: "element", name: "div", attributes: [], children: [{ kind: "text", value: "{{ a(1) }}" }] }]),
    )
      .toThrow("Call arguments are not supported yet");
  });

  test("lists the directives each element matches, in import order", () => {
    class Tooltip {}
    class Primary {}
    class Card {}
    const candidates = [
      { type: Tooltip, selector: selector("[tooltip]"), isComponent: false },
      { type: Primary, selector: selector(".primary"), isComponent: false },
      { type: Card, selector: selector("tk-card"), isComponent: false },
    ];
    const [section] = compileTemplate(
      [
        element("section", {}, [
          element("button", { tooltip: "", class: "primary" }),
          element("p", {}),
        ]),
      ],
      candidates,
    ) as CompiledElement[];
    const [button, p] = section!.children as CompiledElement[];
    expect(section!.directives)
      .toEqual([]);
    expect(button!.directives)
      .toEqual([Tooltip, Primary]);
    expect(p!.directives)
      .toEqual([]);
  });

  test("throws for an element matching a component: not supported yet", () => {
    class Child {}
    expect(() => compileTemplate(
      [element("div", {}, [element("tk-child", {})])],
      [{ type: Child, selector: selector("tk-child"), isComponent: true }],
    ))
      .toThrow("Components in templates are not supported yet: <tk-child> matches Child");
  });
});

function selector(source: string) {
  return Selector.parse(source)
    .getOrThrow();
}

function element(
  name: string,
  attributes: Record<string, string>,
  children: TemplateNode[] = [],
): TemplateNode {
  return {
    kind: "element",
    name,
    attributes: Object.entries(attributes)
      .map(([n, value]) => ({ name: n, value })),
    children,
  };
}

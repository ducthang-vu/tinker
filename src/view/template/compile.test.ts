import { describe, expect, test } from "vitest";
import type { TemplateNode } from "./ast.ts";
import { type CompiledElement, compileTemplate } from "./compile.ts";
import { Selector } from "./selector.ts";
import { Maybe } from "../../functional/index.ts";
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
          component: Maybe.none(),
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

  test("an element matching a component is its host, and keeps its directives", () => {
    class Child {}
    class Tooltip {}
    const [host] = compileTemplate(
      [element("tk-child", { tip: "" }, [{ kind: "text", value: "  " }])],
      [
        { type: Child, selector: selector("tk-child"), isComponent: true },
        { type: Tooltip, selector: selector("[tip]"), isComponent: false },
      ],
    ) as CompiledElement[];
    expect(host!.component.getOrElse(undefined))
      .toBe(Child);
    expect(host!.directives)
      .toEqual([Tooltip]);
    expect(host!.children) // whitespace only: no content of its own
      .toEqual([]);
  });

  test("throws for content inside a component's element, or two components on one", () => {
    class Child {}
    class Other {}
    const child = { type: Child, selector: selector("tk-child"), isComponent: true };
    expect(() => compileTemplate([element("tk-child", {}, [{ kind: "text", value: "Milk" }])], [child]))
      .toThrow("Content inside <tk-child> is not supported yet: Child renders its own template");
    expect(() => compileTemplate([element("tk-child", {}, [element("b", {})])], [child]))
      .toThrow("Content inside <tk-child> is not supported yet");
    expect(() => compileTemplate(
      [element("tk-child", {})],
      [child, { type: Other, selector: selector("tk-child"), isComponent: true }],
    ))
      .toThrow("<tk-child> matches several components: Child, Other");
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

import { describe, expect, test } from "vitest";
import type { ElementNode } from "./ast.ts";
import { BrowserTemplateParser } from "./browser-parser.ts";

const parser = new BrowserTemplateParser();
const parseOne = (source: string) => parser.parse(source)[0] as ElementNode;

describe("BrowserTemplateParser", () => {
  test("parses elements, text and nesting", () => {
    expect(parser.parse("<p>Hi <b>you</b></p>"))
      .toEqual([
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            { kind: "text", value: "Hi " },
            {
              kind: "element",
              name: "b",
              attributes: [],
              children: [{ kind: "text", value: "you" }],
            },
          ],
        },
      ]);
  });

  test("returns several top-level nodes", () => {
    expect(parser.parse("a<i></i>b")
      .map((n) => n.kind))
      .toEqual(["text", "element", "text"]);
  });

  test("keeps attribute names and values raw, including binding syntax", () => {
    const button = parseOne(`<button (click)="inc()" [disabled]="busy()" tooltip title="Save">x</button>`);
    expect(button.attributes)
      .toEqual([
        { name: "(click)", value: "inc()" },
        { name: "[disabled]", value: "busy()" },
        { name: "tooltip", value: "" },
        { name: "title", value: "Save" },
      ]);
  });

  test("keeps interpolation text as written", () => {
    expect(parseOne("<p>Count: {{ count() }}</p>").children)
      .toEqual([
        { kind: "text", value: "Count: {{ count() }}" },
      ]);
  });

  test("parses custom elements", () => {
    expect(parseOne("<tk-counter start=\"1\"></tk-counter>").name)
      .toBe("tk-counter");
  });

  test("drops comments", () => {
    expect(parser.parse("<!-- note --><p></p>"))
      .toHaveLength(1);
  });

  test("reads the children of nested <template> elements", () => {
    const template = parseOne("<template><span>inside</span></template>");
    expect(template.name)
      .toBe("template");
    expect((template.children[0] as ElementNode).name)
      .toBe("span");
  });

  test("allows table parts at the top level", () => {
    expect(parseOne("<tr><td>cell</td></tr>").name)
      .toBe("tr");
  });

  test("uses the document it is given", () => {
    const other = document.implementation.createHTMLDocument("other");
    expect(new BrowserTemplateParser(other)
      .parse("<p></p>"))
      .toHaveLength(1);
  });

  // Known limits of the browser's parser (documented in browser-parser.ts).
  test("limit: names are lowercased", () => {
    const el = parseOne(`<input [ariaLabel]="label()">`);
    expect(el.name)
      .toBe("input");
    expect(el.attributes[0]!.name)
      .toBe("[arialabel]");
  });

  test("limit: self-closing custom elements are not closed", () => {
    const outer = parser.parse("<tk-icon /><span></span>");
    expect(outer)
      .toHaveLength(1);
    expect((outer[0] as ElementNode).children)
      .toHaveLength(1);
  });
});

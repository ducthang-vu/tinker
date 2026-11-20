import { describe, expect, test } from "vitest";
import type { ElementNode, TemplateNode } from "./ast.ts";
import { TemplateSyntaxError, TinkerTemplateParser } from "./tinker-parser.ts";

const parser = new TinkerTemplateParser();

/** The tree without the spans, for the tests that compare the shape of a tree. */
function withoutSpans(nodes: readonly TemplateNode[]): TemplateNode[] {
  return nodes.map((node) => node.kind === "text"
    ? { kind: "text", value: node.value }
    : { kind: "element", name: node.name, attributes: node.attributes, children: withoutSpans(node.children) });
}

const parse = (source: string) => withoutSpans(parser.parse(source));
const parseOne = (source: string) => parse(source)[0] as ElementNode;

/** The error the parser throws for `source`, or fails the test if it does not throw. */
function syntaxError(source: string): TemplateSyntaxError {
  try {
    parse(source);
  } catch (error) {
    return error as TemplateSyntaxError;
  }
  throw new Error(`no error for ${JSON.stringify(source)}`);
}

describe("TinkerTemplateParser", () => {
  test("records the span of each element and text: the offsets it covers", () => {
    const [p] = parser.parse("<p>Hi {{ a }}</p>") as ElementNode[];
    expect(p!.span)
      .toEqual({ start: 0, end: 17 });
    expect(p!.children[0]!.span)
      .toEqual({ start: 3, end: 13 });
  });

  test("a void or self-closing element's span ends at its start tag", () => {
    const [input, icon] = parser.parse(`<input [value]="a"><tk-icon />`) as ElementNode[];
    expect(input!.span)
      .toEqual({ start: 0, end: "<input [value]=\"a\">".length });
    expect(icon!.span)
      .toEqual({ start: "<input [value]=\"a\">".length, end: "<input [value]=\"a\"><tk-icon />".length });
  });

  test("a text inside a script records its span too", () => {
    const [script] = parser.parse("<script>a</script>") as ElementNode[];
    expect(script!.children[0]!.span)
      .toEqual({ start: 8, end: 9 });
  });

  test("parses elements, text and nesting", () => {
    expect(parse("<p>Hi <b>you</b></p>"))
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
    expect(parse("a<i></i>b")
      .map((n) => n.kind))
      .toEqual(["text", "element", "text"]);
  });

  // The trees the browser's HTML parser gave for these well-formed templates, recorded
  // before it was removed. The parser must keep giving them.
  test("gives the trees the browser's HTML parser gave for well-formed templates", () => {
    const cases: readonly [string, readonly TemplateNode[]][] = [
      ["<p>Hi <b>you</b></p>", [
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "Hi ",
            },
            {
              kind: "element",
              name: "b",
              attributes: [],
              children: [
                {
                  kind: "text",
                  value: "you",
                },
              ],
            },
          ],
        },
      ]],
      ["<button (click)=\"inc()\" [disabled]=\"busy()\" tooltip title=\"Save\">x</button>", [
        {
          kind: "element",
          name: "button",
          attributes: [
            {
              name: "(click)",
              value: "inc()",
            },
            {
              name: "[disabled]",
              value: "busy()",
            },
            {
              name: "tooltip",
              value: "",
            },
            {
              name: "title",
              value: "Save",
            },
          ],
          children: [
            {
              kind: "text",
              value: "x",
            },
          ],
        },
      ]],
      ["<p>Count: {{ count() }}</p>", [
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "Count: {{ count() }}",
            },
          ],
        },
      ]],
      ["@if (ok()) { <p>yes</p> } @else { <p>no</p> }", [
        {
          kind: "text",
          value: "@if (ok()) { ",
        },
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "yes",
            },
          ],
        },
        {
          kind: "text",
          value: " } @else { ",
        },
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "no",
            },
          ],
        },
        {
          kind: "text",
          value: " }",
        },
      ]],
      ["<tr><td>cell</td></tr>", [
        {
          kind: "element",
          name: "tr",
          attributes: [],
          children: [
            {
              kind: "element",
              name: "td",
              attributes: [],
              children: [
                {
                  kind: "text",
                  value: "cell",
                },
              ],
            },
          ],
        },
      ]],
      ["<template><span>inside</span></template>", [
        {
          kind: "element",
          name: "template",
          attributes: [],
          children: [
            {
              kind: "element",
              name: "span",
              attributes: [],
              children: [
                {
                  kind: "text",
                  value: "inside",
                },
              ],
            },
          ],
        },
      ]],
      ["<tk-counter start=\"1\"></tk-counter>", [
        {
          kind: "element",
          name: "tk-counter",
          attributes: [
            {
              name: "start",
              value: "1",
            },
          ],
          children: [],
        },
      ]],
      ["<input [value]=\"name()\">", [
        {
          kind: "element",
          name: "input",
          attributes: [
            {
              name: "[value]",
              value: "name()",
            },
          ],
          children: [],
        },
      ]],
      ["<p>a &amp; b &lt;c&gt;</p>", [
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "a & b <c>",
            },
          ],
        },
      ]],
      ["<p>x<!-- note -->y</p>", [
        {
          kind: "element",
          name: "p",
          attributes: [],
          children: [
            {
              kind: "text",
              value: "x",
            },
            {
              kind: "text",
              value: "y",
            },
          ],
        },
      ]],
    ];
    for (const [source, tree] of cases) {
      expect(parse(source), source)
        .toEqual(tree);
    }
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

  test("keeps the case of element and attribute names", () => {
    const el = parseOne(`<Span [ariaLabel]="label()"></Span>`);
    expect(el.name)
      .toBe("Span");
    expect(el.attributes[0]!.name)
      .toBe("[ariaLabel]");
  });

  test("reads single-quoted, double-quoted and unquoted values", () => {
    const el = parseOne(`<a x='one "two"' y="it's" z=/path/to></a>`);
    expect(el.attributes)
      .toEqual([
        { name: "x", value: `one "two"` },
        { name: "y", value: "it's" },
        { name: "z", value: "/path/to" },
      ]);
  });

  test("keeps interpolation text as written", () => {
    expect(parseOne("<p>Count: {{ count() }}</p>").children)
      .toEqual([
        { kind: "text", value: "Count: {{ count() }}" },
      ]);
  });

  test("does not read markup inside {{ }}, so an expression can hold <", () => {
    expect(parseOne(`<p>{{ a < b }} {{ "<b>" }}</p>`).children)
      .toEqual([
        { kind: "text", value: `{{ a < b }} {{ "<b>" }}` },
      ]);
  });

  test("keeps an unclosed {{ as text", () => {
    expect(parseOne("<p>{{ a</p>").children)
      .toEqual([{ kind: "text", value: "{{ a" }]);
  });

  test("keeps a < that does not start a tag as text", () => {
    expect(parseOne("<p>1 < 2 and 3 <= 4</p>").children)
      .toEqual([{ kind: "text", value: "1 < 2 and 3 <= 4" }]);
  });

  test("parses custom elements", () => {
    expect(parseOne("<tk-counter start=\"1\"></tk-counter>").name)
      .toBe("tk-counter");
  });

  test("closes any element with />, custom ones included", () => {
    const outer = parse("<tk-icon /><tk-icon/><span></span>");
    expect(outer.map((n) => (n as ElementNode).name))
      .toEqual(["tk-icon", "tk-icon", "span"]);
    expect((outer[0] as ElementNode).children)
      .toEqual([]);
  });

  test("needs no closing tag for void elements, in any case", () => {
    const nodes = parse("<input [value]=\"a\"><BR><img src=\"x.png\">");
    expect(nodes.map((n) => (n as ElementNode).name))
      .toEqual(["input", "BR", "img"]);
    expect((nodes[0] as ElementNode).children)
      .toEqual([]);
  });

  test("closes a void element with />", () => {
    expect(parseOne("<input />").children)
      .toEqual([]);
  });

  test("drops comments, and text around them stays as separate nodes", () => {
    expect(parse("<!-- note --><p></p>"))
      .toHaveLength(1);
    expect(parseOne("<p>a<!-- x -->b</p>").children)
      .toEqual([
        { kind: "text", value: "a" },
        { kind: "text", value: "b" },
      ]);
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

  test("closing tags match by name, whatever the case", () => {
    expect(parseOne("<P>x</p>").name)
      .toBe("P");
  });

  test("reads script and style as raw text", () => {
    expect(parse("<script>if (a < b) { x(\"</div>\") }</script>"))
      .toEqual([
        {
          kind: "element",
          name: "script",
          attributes: [],
          children: [{ kind: "text", value: `if (a < b) { x("</div>") }` }],
        },
      ]);
    expect(parseOne("<STYLE>a > b {}</style>").children)
      .toEqual([{ kind: "text", value: "a > b {}" }]);
  });

  test("an empty script has no children", () => {
    expect(parseOne("<script></script>").children)
      .toEqual([]);
  });

  test("decodes the named and numeric references it knows", () => {
    expect(parseOne("<p>&amp;&lt;&gt;&quot;&apos;&nbsp;&#65;&#x42;&#X43;</p>").children)
      .toEqual([{ kind: "text", value: "&<>\"' ABC" }]);
    expect(parseOne(`<a title="&lt;b&gt; &#65;"></a>`).attributes)
      .toEqual([{ name: "title", value: "<b> A" }]);
  });

  test("leaves references it does not know as written", () => {
    expect(parseOne("<p>&copy; &#x110000; &#x41</p>").children)
      .toEqual([{ kind: "text", value: "&copy; &#x110000; &#x41" }]);
  });

  describe("errors", () => {
    test("an element that is never closed, at its start", () => {
      const error = syntaxError("<div>\n  <p>x</p>");
      expect(error)
        .toBeInstanceOf(TemplateSyntaxError);
      expect(error.message)
        .toBe("1:1: <div> is never closed");
      expect([error.line, error.column])
        .toEqual([1, 1]);
    });

    test("a closing tag that does not match the element", () => {
      const error = syntaxError("<p>\n  <b></i>");
      expect(error.message)
        .toBe("2:6: </i> does not close <b>");
      expect([error.line, error.column])
        .toEqual([2, 6]);
    });

    test("a closing tag with no element open", () => {
      expect(syntaxError("<p></p></p>").message)
        .toBe("1:8: closing tag with no element open");
    });

    test("an element nested in itself is reported where the outer one ends", () => {
      expect(syntaxError("<p><p></p>").message)
        .toBe("1:1: <p> is never closed");
    });

    test("a declaration other than a comment", () => {
      expect(syntaxError("<!DOCTYPE html>").message)
        .toBe("1:1: only comments can start with <!");
    });

    test("a comment that is never closed", () => {
      expect(syntaxError("<!-- note").message)
        .toBe("1:1: comment is never closed");
    });

    test("a quoted value that is never closed", () => {
      expect(syntaxError(`<p class="x>`).message)
        .toBe("1:10: attribute value is never closed");
    });

    test("an unquoted value that is missing", () => {
      expect(syntaxError("<p class=>").message)
        .toBe("1:10: expected an attribute value");
    });

    test("a start tag that is never closed", () => {
      expect(syntaxError("<p").message)
        .toBe("1:1: <p is never closed");
      expect(syntaxError("<p a").message)
        .toBe("1:1: <p is never closed");
    });

    test("an attribute name that is missing", () => {
      expect(syntaxError(`<p "x">`).message)
        .toBe("1:4: expected an attribute name");
      expect(syntaxError("<p / >").message)
        .toBe("1:4: expected an attribute name");
    });

    test("a duplicate attribute", () => {
      const error = syntaxError(`<p a="1" a="2"></p>`);
      expect(error.message)
        .toBe("1:10: duplicate attribute a");
    });

    test("a closing tag with no name", () => {
      expect(syntaxError("<div></ p></div>").message)
        .toBe("1:8: expected an element name");
    });

    test("a closing tag with no name, outside any element", () => {
      expect(syntaxError("</ p>").message)
        .toBe("1:1: closing tag with no element open");
    });

    test("junk before the > of a closing tag", () => {
      expect(syntaxError("<p></p x>").message)
        .toBe("1:8: expected >");
    });

    test("a script or style that is never closed", () => {
      expect(syntaxError("<style>a {}").message)
        .toBe("1:1: <style> is never closed");
    });

    test("an error is a plain Error with a name, for logs", () => {
      const error = syntaxError("<p>");
      expect(error)
        .toBeInstanceOf(Error);
      expect(error.name)
        .toBe("TemplateSyntaxError");
    });
  });
});

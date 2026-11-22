import { parseNodes } from "../test-support.ts";
import { describe, expect, test } from "vitest";
import type { TemplateNode } from "./ast.ts";
import { type CompiledElement, compileTemplate as compileTemplateEither } from "./compile.ts";
import { valueOrThrow } from "@tinker/functional/v1";

const compileTemplate = (...args: Parameters<typeof compileTemplateEither>) =>
  valueOrThrow(compileTemplateEither(...args));
import { TemplateCompileError } from "./compile-error.ts";
import { Selector } from "./selector.ts";
import { Maybe } from "@tinker/functional";
import { ExpressionParser } from "./expression.ts";
import { match, map, Left, Right } from "@tinker/functional/v1";

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
              interpolation: { strings: ["Hi ", ""], expressions: [match(ExpressionParser.parse("name()"), { Left: (error) => {
                throw error;
              }, Right: (value) => value })] },
            },
          ],
          references: [],
          directives: [],
          component: Maybe.none(),
          container: false,
          classObjects: [],
          classBindings: [],
          inputBindings: [],
          styleBindings: [],
          attributeBindings: [],
          outputBindings: [],
        },
        { kind: "text", interpolation: { strings: ["plain"], expressions: [] } },
      ]);
  });

  test("throws for an invalid {{ }}, however deep", () => {
    expect(() =>
      compileTemplate([{ kind: "element", name: "div", attributes: [], children: [{ kind: "text", value: "{{ a(1 2) }}" }] }]),
    )
      .toThrow(`Expected "," or ")", found "2"`);
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

  test("sorts attributes: plain ones, and class bindings with their expression", () => {
    const [p] = compileTemplate([
      element("p", { "class": "note", "[class.done]": "todo.done()", "title": "x" }),
    ]) as CompiledElement[];
    expect(p!.attributes)
      .toEqual([{ name: "class", value: "note" }, { name: "title", value: "x" }]);
    expect(p!.classBindings)
      .toEqual([{ name: "done", expression: match(ExpressionParser.parse("todo.done()"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }) }]);
  });

  test("sorts style and attribute bindings apart, with their expression", () => {
    const [p] = compileTemplate([
      element("p", { "[style.background-color]": "bg()", "[attr.aria-label]": "label()" }),
    ]) as CompiledElement[];
    expect(p!.styleBindings)
      .toEqual([{ name: "background-color", expression: match(ExpressionParser.parse("bg()"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }) }]);
    expect(p!.attributeBindings)
      .toEqual([{ name: "aria-label", expression: match(ExpressionParser.parse("label()"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }) }]);
    expect(p!.classBindings)
      .toEqual([]);
  });

  test("reports an invalid style or attribute expression with its key", () => {
    expect(() => compileTemplate([element("p", { "[style.color]": "a(1 2)" })]))
      .toThrow(/in \[style\.color\] on <p>/);
    expect(() => compileTemplate([element("p", { "[attr.title]": "a(1 2)" })]))
      .toThrow(`Expected "," or ")", found "2" (at column 5 in "a(1 2)"), in [attr.title] on <p>`);
  });

  test("sorts input bindings apart, with their expression", () => {
    class Item {}
    const [host] = compileTemplate(
      [element("tk-item", { "[label]": "item().name", "[class.done]": "done" })],
      [{ type: Item, selector: selector("tk-item"), isComponent: true }],
    ) as CompiledElement[];
    expect(host!.inputBindings)
      .toEqual([{ name: "label", expression: match(ExpressionParser.parse("item().name"), { Left: (error) => {
        throw error;
      }, Right: (value) => value }) }]);
    expect(host!.classBindings.map(({ name }) => name))
      .toEqual(["done"]);
  });

  test("rejects other binding syntax, and invalid class binding expressions", () => {
    expect(() => compileTemplate([element("button", { "[a.b.c]": "c" })]))
      .toThrow(`Bindings are not supported yet: "[a.b.c]" on <button>`);
    expect(() => compileTemplate([element("p", { "[a.b.c]": "c" })]))
      .toThrow(`Bindings are not supported yet: "[a.b.c]" on <p>`);
    expect(() => compileTemplate([element("p", { "[title]": "t" })]))
      .toThrow(
        "[title] on <p>: only inputs can be bound, and no imported directive or component matches this element",
      );
    expect(() => compileTemplate([element("p", { "[class.on]": "a(1 2)" })]))
      .toThrow(`Expected "," or ")", found "2" (at column 5 in "a(1 2)"), in [class.on] on <p>`);
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
    expect(host!.children) // its content (here whitespace): the component shows it in its slots
      .toHaveLength(1);
  });

  test("compiles the content of a component's element, and <slot> with its name", () => {
    class Child {}
    const child = { type: Child, selector: selector("tk-child"), isComponent: true };
    const [host] = compileTemplate(
      [element("tk-child", {}, [{ kind: "text", value: "Milk" }, element("b", { slot: "x" })])],
      [child],
    ) as CompiledElement[];
    expect(host!.children.map((node) => node.kind))
      .toEqual(["text", "element"]);
    expect(compileTemplate([element("slot", { name: "title" })]))
      .toEqual([{ kind: "slot", name: "title" }]);
    expect(compileTemplate([element("slot", {})]))
      .toEqual([{ kind: "slot", name: "" }]);
  });

  test("throws for two components on one element", () => {
    class Child {}
    class Other {}
    const child = { type: Child, selector: selector("tk-child"), isComponent: true };
    expect(() => compileTemplate(
      [element("tk-child", {})],
      [child, { type: Other, selector: selector("tk-child"), isComponent: true }],
    ))
      .toThrow("<tk-child> matches several components: Child, Other");
  });
});

function selector(source: string) {
  return match(Selector.parse(source), { Left: (error) => {
    throw error;
  }, Right: (value) => value });
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

describe("@map", () => {
  test("a list, the name of its items, and the body", () => {
    const [map] = compileTemplate([{ kind: "text", value: "@map todos(); let todo { x }" }]);
    expect(map)
      .toMatchObject({ kind: "map", item: { kind: "bind", name: "todo" }, track: undefined });
    expect(map)
      .toHaveProperty("list");
    expect(map)
      .toHaveProperty("body");
  });

  test("a track key is optional, and is compiled", () => {
    const [map] = compileTemplate([{ kind: "text", value: "@map todos(); let todo; track todo.id { x }" }]);
    expect(map)
      .toMatchObject({ kind: "map", item: { kind: "bind", name: "todo" } });
    expect((map as { track?: unknown }).track)
      .toBeDefined();
  });

  test("the header needs a list and a name, and the name is not a $ name", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@map todos() { x }" }]))
      .toThrow("@map needs a list and a name");
    expect(() => compileTemplate([{ kind: "text", value: "@map todos(); let $x { x }" }]))
      .toThrow(`"$x" is reserved`);
    expect(() => compileTemplate([{ kind: "text", value: "@map todos(); let { id: $x } { x }" }]))
      .toThrow(`"$x" is reserved`);
    expect(() => compileTemplate([{ kind: "text", value: "@map todos(); let { id } as $row { x }" }]))
      .toThrow(`"$row" is reserved`);
    expect(() => compileTemplate([{ kind: "text", value: "@map todos(); let 1 { x }" }]))
      .toThrow("takes a name or a pattern");
    expect(() => compileTemplate([{ kind: "text", value: "@map todos(); let 1 as row { x }" }]))
      .toThrow("takes a name or a pattern");
  });

  test("the header has at most a track after the name", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@map a; let b; track c; d { x }" }]))
      .toThrow("@map needs a list and a name");
    expect(() => compileTemplate([{ kind: "text", value: "@map a; let b; key c { x }" }]))
      .toThrow(`@map takes "track key" after the name`);
  });

  test("the list needs a value", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@map ; let b { x }" }]))
      .toThrow("@map needs a value");
  });

  test("@mapping is text, not a block", () => {
    const compiled = compileTemplate([{ kind: "text", value: "@mapping" }]);
    expect(compiled)
      .toEqual([{ kind: "text", interpolation: { strings: ["@mapping"], expressions: [] } }]);
  });
});

describe("@map track { fields }", () => {
  test("the braces are the track's field names, not the body", () => {
    const [map] = compileTemplate([{ kind: "text", value: "@map todos(); let todo; track { id, kind } { x }" }]);
    expect(map)
      .toMatchObject({ kind: "map", track: { kind: "fields", names: ["id", "kind"] } });
    expect(map)
      .toMatchObject({ body: [expect.anything()] });
  });

  test("the names must be plain names, each once, and inside braces", () => {
    const compile = (track: string) => compileTemplate([{ kind: "text", value: `@map a; let b; track ${track} { x }` }]);
    expect(() => compile("{ id: 1 }"))
      .toThrow("takes field names");
    expect(() => compile("{ id, id }"))
      .toThrow("names a field twice");
    expect(() => compile("{ }"))
      .toThrow("takes field names");
    expect(() => compile("{ id } x"))
      .toThrow("takes field names");
    expect(() => compileTemplate([{ kind: "text", value: "@map a; let b; track { id { x }" }]))
      .toThrow(`Missing "}" in the pattern`);
  });
});

describe("@map let patterns and @case array patterns", () => {
  test("let takes an object or array pattern, which binds the names it destructures", () => {
    const [map] = compileTemplate([{ kind: "text", value: "@map rows(); let { id, title } { x }" }]);
    expect(map)
      .toMatchObject({ kind: "map", item: { kind: "object" } });
    const [array] = compileTemplate([{ kind: "text", value: "@map rows(); let [first, ...rest] { x }" }]);
    expect(array)
      .toMatchObject({ kind: "map", item: { kind: "array", rest: "rest" } });
  });

  test("let takes an as alias after an object or array pattern", () => {
    const [map] = compileTemplate([{ kind: "text", value: "@map rows(); let { id, title } as row { x }" }]);
    expect(map)
      .toMatchObject({ kind: "map", item: { kind: "as", name: "row", pattern: { kind: "object" } } });
    const [array] = compileTemplate([{ kind: "text", value: "@map rows(); let [first, ...rest] as list { x }" }]);
    expect(array)
      .toMatchObject({ kind: "map", item: { kind: "as", name: "list", pattern: { kind: "array", rest: "rest" } } });
  });

  test("a @case can be an array pattern, empty or with a rest", () => {
    const [match] = compileTemplate([{ kind: "text", value: "@match list() { @case [] { none } @case [first, ...rest] { some } }" }]);
    expect(match)
      .toMatchObject({
        kind: "match",
        cases: [
          { pattern: { kind: "array", items: [] } },
          { pattern: { kind: "array", items: [{ kind: "bind", name: "first" }], rest: "rest" } },
        ],
      });
  });

  test("a case can hold an object inside an array, and its braces do not end the header", () => {
    const [match] = compileTemplate([{ kind: "text", value: "@match list() { @case [{ id }] { one } @default { other } }" }]);
    expect(match)
      .toMatchObject({ kind: "match", cases: [{ pattern: { kind: "array" } }], default: [expect.anything()] });
  });

  test("the array pattern needs its ] and its rest comes last, with a name", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@match x { @case [a { x } }" }]))
      .toThrow(`Missing "]"`);
    expect(() => compileTemplate([{ kind: "text", value: "@match x { @case [...a, b] { x } }" }]))
      .toThrow("comes last");
    expect(() => compileTemplate([{ kind: "text", value: "@match x { @case [...] { x } }" }]))
      .toThrow("needs a name");
  });
});

describe("@map header errors", () => {
  test("a @map needs its body, and a let that is not a pattern is reported", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@map a; let b" }]))
      .toThrow(`Missing "{" after`);
    expect(() => compileTemplate([{ kind: "text", value: "@map a; let 1x { x }" }]))
      .toThrow("in @map");
    expect(() => compileTemplate([{ kind: "text", value: "@map items[0]; let x { x }" }]))
      .toThrow("in @map");
  });
});

describe("@case bodies after the remaining patterns", () => {
  test("the body follows an alternative of objects, and a not", () => {
    const [alt] = compileTemplate([{ kind: "text", value: "@match x { @case { a: 1 } | { b: 2 } { one } }" }]);
    expect(alt)
      .toMatchObject({ kind: "match", cases: [{ pattern: { kind: "alt" } }] });
    const [negated] = compileTemplate([{ kind: "text", value: "@match x { @case not { a: 1 } { one } }" }]);
    expect(negated)
      .toMatchObject({ kind: "match", cases: [{ pattern: { kind: "not" } }] });
  });

  test("a [ that does not start a pattern is not skipped as one", () => {
    expect(() => compileTemplate([{ kind: "text", value: "@match x { @case a[0] { one } }" }]))
      .toThrow("in @case");
  });
});

describe("template references", () => {
  test("#name on an element is a reference, not an attribute", () => {
    const [p] = compileTemplate([{
      kind: "element",
      name: "p",
      attributes: [{ name: "#box", value: "" }, { name: "class", value: "x" }],
      children: [],
    }]) as CompiledElement[];
    expect(p)
      .toMatchObject({
        references: [{ name: "box", target: { kind: "element" } }],
        attributes: [{ name: "class", value: "x" }],
      });
  });

  test("the three reference forms: the element, an exportAs, and the component", () => {
    const element = (attributes: { name: string; value: string }[]) =>
      compileTemplate([{ kind: "element", name: "p", attributes, children: [] }]) as CompiledElement[];
    expect(element([{ name: "#box", value: "Tip" }])[0]!.references)
      .toEqual([{ name: "box", target: { kind: "export", exportAs: "Tip" } }]);
    expect(element([{ name: "##item", value: "" }])[0]!.references)
      .toEqual([{ name: "item", target: { kind: "component" } }]);
  });

  test("a reference must be a plain name, declared once, with valid values", () => {
    const element = (attributes: { name: string; value: string }[]) =>
      compileTemplate([{ kind: "element", name: "p", attributes, children: [] }]);
    expect(() => element([{ name: "#1x", value: "" }]))
      .toThrow("is not a template reference");
    expect(() => element([{ name: "#box", value: "" }, { name: "#box", value: "" }]))
      .toThrow("#box is declared twice");
    expect(() => element([{ name: "#box", value: "1x" }]))
      .toThrow("is not an exportAs name");
    expect(() => element([{ name: "##item", value: "x" }]))
      .toThrow("takes no value");
  });

  test("a let- name cannot start with $, which the framework reserves", () => {
    expect(() => compileTemplate([{
      kind: "element",
      name: "template",
      attributes: [{ name: "#row", value: "" }, { name: "let-$index", value: "" }],
      children: [],
    }]))
      .toThrow("names starting with $ are the framework's");
  });
});

describe("qualified bindings", () => {
  test("[owner.input] and (owner.output) name their owner; a modifier is not an owner", () => {
    class Abc {}
    const candidates = [{ type: Abc, selector: selector("[abc]"), isComponent: false }];
    const [button] = compileTemplate([{
      kind: "element",
      name: "button",
      attributes: [
        { name: "abc", value: "" },
        { name: "[abc.label]", value: "x()" },
        { name: "(abc.fired)", value: "go()" },
        { name: "(click.prevent)", value: "go()" },
      ],
      children: [],
    }], candidates) as CompiledElement[];
    expect(button!.inputBindings)
      .toMatchObject([{ name: "label", owner: "abc" }]);
    expect(button!.outputBindings)
      .toMatchObject([
        { name: "fired", owner: "abc" },
        // `click.prevent` is the output `prevent` of `click`, or the DOM event with `.prevent`.
        {
          name: "prevent",
          owner: "click",
          domFallback: { event: "click", modifiers: ["prevent"] },
        },
      ]);
  });

  test("a qualified event with an unknown modifier is an error", () => {
    class Abc {}
    const candidates = [{ type: Abc, selector: selector("[abc]"), isComponent: false }];
    expect(() => compileTemplate([{
      kind: "element",
      name: "button",
      attributes: [{ name: "abc", value: "" }, { name: "(abc.fired.bogus)", value: "go()" }],
      children: [],
    }], candidates))
      .toThrow("Unknown modifier");
  });
});

describe("[class] object on a container", () => {
  test("is an error, since a container has no element to take the classes", () => {
    expect(() => compileTemplate([{
      kind: "element",
      name: "tk-container",
      attributes: [{ name: "[class]", value: "{ a: b }" }],
      children: [],
    }]))
      .toThrow("a container has no element");
  });
});

describe("a compile error in a tree built by hand", () => {
  test("has no span, so it is a plain error", () => {
    const error = (() => {
      try {
        compileTemplate([{ kind: "text", value: "{{ a + }}" }]);
      } catch (caught) {
        return caught as Error;
      }
      throw new Error("no error");
    })();
    expect(error)
      .not.toBeInstanceOf(TemplateCompileError);
    expect(error.message)
      .toContain("Missing a name at the end");
  });
});

describe("compileTemplate returns its error", () => {
  test("an invalid {{ }} is a Left, not a throw", () => {
    const result = compileTemplateEither(parseNodes("<p>{{ a(1 2) }}</p>"));
    expect(match(result, { Left: (error) => error.message, Right: () => "compiled" }))
      .toContain("Expected \",\" or \")\", found \"2\"");
  });
});

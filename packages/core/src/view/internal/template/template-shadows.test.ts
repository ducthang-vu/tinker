import { describe, expect, test } from "vitest";
import { compileTemplate, type CompiledNode } from "./compile.ts";
import { patternNames, shadowsIn } from "./template-shadows.ts";
import type { Pattern } from "./pattern.ts";
import { TinkerTemplateParser } from "./tinker-parser.ts";
import { valueOrThrow } from "@tinker/functional";

/** The compiled nodes of a template, with no directives. */
function compiled(source: string): readonly CompiledNode[] {
  const { nodes } = new TinkerTemplateParser()
    .parseAll(source);
  return valueOrThrow(compileTemplate(nodes, []));
}

/** The shadowing names of a template, given what the component has. */
function shadows(source: string, hidden: Record<string, string> = {}): string[] {
  return shadowsIn(compiled(source), new Map(Object.entries(hidden)))
    .map(({ name }) => name);
}

describe("shadowsIn", () => {
  test("a @let that has the name of a member shadows it", () => {
    expect(shadows("@let title = 1; <p>{{ title }}</p>", { title: "a member of Page" }))
      .toEqual(["title"]);
  });

  test("a @let that has the name of a built-in shadows it", () => {
    expect(shadows("@let $flow = 1;"))
      .toEqual(["$flow"]);
  });

  test("a @let is visible to the nodes after it, not before", () => {
    expect(shadows("<p>{{ a }}</p>@let a = 1;@let a = 2;"))
      .toEqual(["a"]);
  });

  test("a @map item that has the name of a @let around the map shadows it", () => {
    expect(shadows("@let item = 1; @map items(); let other { <p>{{ other }}</p> }"))
      .toEqual([]);
    expect(shadows("@let item = 1; @map items(); let item { <p>{{ item }}</p> }"))
      .toEqual(["item"]);
  });

  test("a @map item shadows a member of the component", () => {
    expect(shadows("@map items(); let row { <p>{{ row }}</p> }", { row: "a member of Page" }))
      .toEqual(["row"]);
  });

  test("names a @map destructures are checked, not only the item", () => {
    expect(shadows("@map rows(); let { id, label } { <p>{{ id }}</p> }", { label: "a member of Page" }))
      .toEqual(["label"]);
  });

  test("a @case's bound names are checked", () => {
    expect(shadows("@match (value) { @case n { <p>{{ n }}</p> } }", { n: "a member of Page" }))
      .toEqual(["n"]);
  });

  test("a @case binds names into its body only, and two cases may bind the same name", () => {
    expect(shadows("@match (value) { @case n { <p>{{ n }}</p> } @case n { <p>{{ n }}</p> } }"))
      .toEqual([]);
  });

  test("a binding in a case shadows a @let around the match", () => {
    expect(shadows("@let n = 1; @match (value) { @case n { <p>{{ n }}</p> } }"))
      .toEqual(["n"]);
  });

  test("the let- names of a template shadow the names around it", () => {
    expect(shadows("@let item = 1; <template #row let-item><p>{{ item }}</p></template>"))
      .toEqual(["item"]);
  });

  test("a nested block sees the names declared around it", () => {
    expect(shadows("@let a = 1; @map rows(); let b { @map cols(); let a { <p>{{ a }}</p> } }"))
      .toEqual(["a"]);
  });

  test("a @let inside a nested element is checked too", () => {
    expect(shadows("<div><p>@let x = 1;</p></div>", { x: "a member of Page" }))
      .toEqual(["x"]);
    expect(shadows("<div>@let x = 1;</div>", { x: "a member of Page" }))
      .toEqual(["x"]);
  });

  test("each shadowing name says what it hides", () => {
    const [found] = shadowsIn(compiled("@let title = 1;"), new Map([["title", "a member of Page"]]));

    expect(found)
      .toEqual({ name: "title", hides: "a member of Page" });
  });

  test("a template with no shadowing names gives none", () => {
    expect(shadows("@let a = 1; @map rows(); let row { <p>{{ row }}</p> }", { other: "x" }))
      .toEqual([]);
  });

  test("the empty default of a match is visited too", () => {
    expect(shadows("@match (value) { @case 1 { <p>x</p> } @default { @let title = 1; } }", { title: "a member" }))
      .toEqual(["title"]);
  });
});

describe("patternNames", () => {
  const bind = (name: string): Pattern => ({ kind: "bind", name });

  test("a name binds itself, and an `as` binds its own name and its pattern's", () => {
    expect(patternNames(bind("x")))
      .toEqual(["x"]);
    expect(patternNames({ kind: "as", pattern: bind("a"), name: "b" }))
      .toEqual(["b", "a"]);
  });

  test("an object binds the names of its fields, and an array its items and rest", () => {
    expect(patternNames({ kind: "object", fields: [{ key: "k", pattern: bind("v") }] }))
      .toEqual(["v"]);
    expect(patternNames({ kind: "array", items: [bind("a")], rest: "r" }))
      .toEqual(["a", "r"]);
    expect(patternNames({ kind: "array", items: [bind("a")] }))
      .toEqual(["a"]);
  });

  test("an alternative binds the names of each option, and a wrapper binds its pattern's", () => {
    expect(patternNames({ kind: "alt", options: [bind("a"), bind("b")] }))
      .toEqual(["a", "b"]);
    expect(patternNames({ kind: "some", pattern: bind("a") }))
      .toEqual(["a"]);
    expect(patternNames({ kind: "ok", pattern: bind("a") }))
      .toEqual(["a"]);
    expect(patternNames({ kind: "error", pattern: bind("a") }))
      .toEqual(["a"]);
  });

  test("a regex binds its named groups, and a pattern that binds nothing binds none", () => {
    expect(patternNames({ kind: "regex", source: "(?<y>\\d+)", flags: "", names: ["y"] }))
      .toEqual(["y"]);
    expect(patternNames({ kind: "truthy" }))
      .toEqual([]);
    expect(patternNames({ kind: "not", pattern: bind("a") }))
      .toEqual([]);
  });
});

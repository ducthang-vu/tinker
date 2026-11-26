import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { forbiddenMembersIn, namesIn, unknownReads } from "./template-names.ts";
import { valueOrThrow } from "@tinker/functional";

const parse = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("namesIn", () => {
  test("reads the names an expression reads from the component: fields, calls and pipes", () => {
    const names = namesIn([
      { kind: "text", value: "x" },
      { kind: "let", name: "total", expression: parse("count() + price") },
      { kind: "value", expression: parse("format(price) | round") },
    ]);
    expect([...names.read].sort())
      .toEqual(["count", "format", "price", "round"]);
  });

  test("declared names are taken from anywhere: let names, pattern bindings and references", () => {
    const names = namesIn([
      { kind: "let", name: "total", expression: parse("count") },
      { kind: "map", item: { kind: "bind", name: "item" }, list: parse("items") },
      { kind: "case", pattern: { kind: "array", items: [], rest: "tail" } },
      { kind: "declaration", name: "row", names: ["cell"] },
    ]);
    expect([...names.declared].sort())
      .toEqual(["cell", "item", "row", "tail", "total"]);
  });

  test("a property's name is a read, not a declaration", () => {
    expect(namesIn([{ kind: "value", expression: parse("title") }]).declared)
      .toEqual([]);
  });

  test("only the first name of a path is read from the component: the rest is a member of a value", () => {
    expect(namesIn([{ kind: "value", expression: parse("item.title") }]).read)
      .toEqual(["item"]);
  });

  test("only string names of a list are declared", () => {
    expect(namesIn([{ kind: "regex", source: "x", flags: "", names: ["a", 2] }]).declared)
      .toEqual(["a"]);
  });
});

describe("unknownReads", () => {
  const text = (source: string) => ({
    kind: "text",
    interpolation: { strings: ["", ""], expressions: [parse(source)] },
  });
  const element = (references: readonly { name: string }[], children: readonly unknown[]) => ({
    kind: "element",
    name: "p",
    references,
    classBindings: [],
    classObjects: [],
    styleBindings: [],
    attributeBindings: [],
    inputBindings: [],
    outputBindings: [],
    children,
  });
  const nodes = (list: readonly unknown[]) => list as never;
  const known = new Set(["items", "count", "status", "id", "menu"]);

  test("a @map item is visible in its body, and unknown outside it", () => {
    expect(unknownReads(nodes([
      { kind: "map", list: parse("items"), item: { kind: "bind", name: "item" }, body: [text("item")] },
      text("item"),
    ]), known))
      .toEqual(["item"]);
  });

  test("a @map track expression reads the item, which is visible to it", () => {
    const track = (source: string) => ({
      kind: "map",
      list: parse("items"),
      track: { kind: "value", expression: parse(source) },
      item: { kind: "bind", name: "item" },
      body: [],
    });
    expect(unknownReads(nodes([track("item.id")]), new Set(["items"])))
      .toEqual([]);
    expect(unknownReads(nodes([track("id")]), new Set(["items"])))
      .toEqual(["id"]);
  });

  test("a @let is visible to the nodes after it, not before", () => {
    expect(unknownReads(nodes([
      text("total"),
      { kind: "let", name: "total", expression: parse("count") },
      text("total"),
    ]), known))
      .toEqual(["total"]);
  });

  test("a template reference is visible in its element and after it, not before", () => {
    expect(unknownReads(nodes([
      text("input"),
      element([{ name: "input" }], [text("input")]),
      text("input"),
    ]), known))
      .toEqual(["input"]);
  });

  test("a @case binding is visible in its case, and a guard reads it there", () => {
    expect(unknownReads(nodes([
      {
        kind: "match",
        subject: parse("status"),
        cases: [{ pattern: { kind: "bind", name: "done" }, guard: parse("done"), body: [text("done")] }],
        default: [text("done")],
      },
    ]), known))
      .toEqual(["done"]);
  });

  test("a match without a subject or a default reads what it can", () => {
    expect(unknownReads(nodes([
      { kind: "match", cases: [{ pattern: { kind: "any" }, body: [text("count")] }] },
    ]), known))
      .toEqual([]);
  });

  test("a template's let- names are visible in its body only", () => {
    expect(unknownReads(nodes([
      { kind: "declaration", name: "row", names: ["cell"], body: [text("cell"), text("row")] },
      text("cell"),
    ]), known))
      .toEqual(["cell"]);
  });

  test("a $ name is a template special, and a slot reads nothing", () => {
    expect(unknownReads(nodes([text("$index"), { kind: "slot", name: "" }]), known))
      .toEqual([]);
  });

  test("a name read twice is reported once", () => {
    expect(unknownReads(nodes([text("gone"), text("gone")]), known))
      .toEqual(["gone"]);
  });

  describe("forbiddenMembersIn", () => {
    test("finds the forbidden members a template reads, once each", () => {
      expect(forbiddenMembersIn([
        { kind: "value", expression: parse("title.constructor") },
        { kind: "value", expression: parse("items.constructor.prototype") },
      ]))
        .toEqual(["constructor", "prototype"]);
    });

    test("finds none in a template that reads ordinary members", () => {
      expect(forbiddenMembersIn([{ kind: "value", expression: parse("title.length") }]))
        .toEqual([]);
    });
  });
});

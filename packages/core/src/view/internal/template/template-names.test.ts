import { describe, expect, test } from "vitest";
import { ExpressionParser } from "./expression.ts";
import { namesIn } from "./template-names.ts";
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

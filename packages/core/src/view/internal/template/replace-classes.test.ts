import { describe, expect, test } from "vitest";
import { compileSource } from "../../compiler/compile-source.ts";
import { replaceClasses } from "./replace-classes.ts";
import { getOrElse, valueOrThrow } from "@tinker/functional";
import type { CompiledNode } from "./compile.ts";

class Real {}
class Fake {}
const replace = (type: object) => (type === Real ? Fake : type) as typeof Real;
const imports = [{ selector: "tk-real", isComponent: true, type: Real }];

/** The classes named by the tree, in order, whatever block holds them. */
function classesOf(nodes: readonly CompiledNode[]): unknown[] {
  return nodes.flatMap((node): unknown[] => {
    switch (node.kind) {
      case "element":
        return [
          ...node.directives,
          ...[getOrElse(node.component, undefined)].filter((type) => type !== undefined),
          ...classesOf(node.children),
        ];
      case "declaration":
      case "map":
        return classesOf(node.body);
      case "match":
        return [
          ...node.cases.flatMap((item) => classesOf(item.body)),
          ...(node.default ? classesOf(node.default) : []),
        ];
      default:
        return [];
    }
  });
}

describe("replaceClasses", () => {
  test("replaces the class of an element wherever it is: in a block, a branch, or a declaration", () => {
    const nodes = valueOrThrow(compileSource(
      "@let a = 1; <tk-real></tk-real> @map items(); let x { <tk-real></tk-real> } @match v() { @case 1 { <tk-real></tk-real> } @default { <tk-real></tk-real> } }",
      imports,
    ));
    expect(classesOf(nodes))
      .toEqual([Real, Real, Real, Real]);
    expect(classesOf(replaceClasses(nodes, replace)))
      .toEqual([Fake, Fake, Fake, Fake]);
  });

  test("a match without a default is kept without one", () => {
    const nodes = valueOrThrow(compileSource("@match v() { @case 1 { <tk-real></tk-real> } }", imports));
    const [match] = replaceClasses(nodes, replace);
    expect((match as { default?: unknown }).default)
      .toBeUndefined();
  });

  test("a tree with no class is kept as it is", () => {
    const nodes = valueOrThrow(compileSource("<p>text {{ a() }}</p>"));
    expect(replaceClasses(nodes, replace))
      .toEqual(nodes);
  });

  test("the body of a declaration is replaced too", () => {
    const [inner] = valueOrThrow(compileSource("<tk-real></tk-real>", imports));
    const declaration: CompiledNode = { kind: "declaration", name: "a", names: ["a"], body: [inner!] };
    expect(classesOf(replaceClasses([declaration], replace)))
      .toEqual([Fake]);
  });
});

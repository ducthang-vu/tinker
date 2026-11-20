import { describe, expect, test } from "vitest";
import { readSource } from "./declarations.ts";

const read = (code: string) => readSource(code, "file.ts");

describe("readSource", () => {
  test("reads a component's selector, template and imports", () => {
    const { declarations } = read(`
      import { Item } from "./item.ts";
      @Component({ selector: "tk-page", template: "<p>hi</p>", imports: [Item] })
      export class Page {}
    `);
    expect(declarations)
      .toEqual([{
        name: "Page",
        kind: "component",
        selector: "tk-page",
        template: "<p>hi</p>",
        imports: ["Item"],
      }]);
  });

  test("reads a directive, with its selector", () => {
    expect(read(`@Directive({ selector: "[item]" }) class Item {}`).declarations)
      .toEqual([{ name: "Item", kind: "directive", selector: "[item]", template: undefined, imports: [] }]);
  });

  test("reads a template literal with no substitutions, and gives none for one with them", () => {
    expect(read("@Component({ template: `<p>a</p>` }) class A {}").declarations[0]!.template)
      .toBe("<p>a</p>");
    expect(read("@Component({ template: `<p>${x}</p>` }) class A {}").declarations[0]!.template)
      .toBeUndefined();
  });

  test("gives no value for an option that is computed, or not a literal", () => {
    const [declaration] = read(`@Directive({ selector, template: html }) class A {}`).declarations;
    expect(declaration)
      .toMatchObject({ selector: undefined, template: undefined });
    const [keyed] = read(`@Directive({ [key]: "[a]" }) class A {}`).declarations;
    expect(keyed!.selector)
      .toBeUndefined();
  });

  test("reads quoted keys, and skips spread properties", () => {
    const [declaration] = read(`@Directive({ ...base, "selector": "[a]" }) class A {}`).declarations;
    expect(declaration!.selector)
      .toBe("[a]");
  });

  test("gives no imports when the list is not all identifiers", () => {
    const [declaration] = read(`@Component({ imports: [A, ...more] }) class C {}`).declarations;
    expect(declaration!.imports)
      .toBeUndefined();
  });

  test("gives no imports when the list has a hole", () => {
    const [declaration] = read(`@Component({ imports: [, A] }) class C {}`).declarations;
    expect(declaration!.imports)
      .toBeUndefined();
  });

  test("gives no imports when there is no imports option", () => {
    const [declaration] = read(`@Component({ template: "" }) class C {}`).declarations;
    expect(declaration!.imports)
      .toEqual([]);
  });

  test("ignores classes with no decorator of ours", () => {
    expect(read(`
      @Injectable() class Service {}
      class Plain {}
      @ns.Component({ selector: "x" }) class Namespaced {}
      @Component class NotACall {}
      @Component(options) class NotAnObject {}
      @Component({ selector: "x" }) export default class {}
      export const value = 1;
    `).declarations)
      .toEqual([]);
  });

  test("finds our decorator after one of another kind", () => {
    const [declaration] = read(`@Injectable() @Directive({ selector: "[b]" }) class B {}`).declarations;
    expect(declaration!.selector)
      .toBe("[b]");
  });

  test("reads named imports, with and without an alias, and skips the other kinds", () => {
    expect(read(`
      import Default from "./default.ts";
      import * as all from "./all.ts";
      import { Item, Card as Tile } from "./item.ts";
      import { "tk-name" as Named } from "./named.ts";
    `).imports)
      .toEqual([
        { local: "Item", imported: "Item", source: "./item.ts" },
        { local: "Tile", imported: "Card", source: "./item.ts" },
        { local: "Named", imported: "tk-name", source: "./named.ts" },
      ]);
  });
});

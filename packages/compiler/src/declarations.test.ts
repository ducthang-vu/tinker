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
        template: { text: "<p>hi</p>", start: expect.any(Number), end: expect.any(Number) },
        imports: ["Item"],
        exportAs: undefined,
        exportAsIsDynamic: false,
        members: [],

        inputNames: {},
        statementEnd: expect.any(Number),
      }]);
  });

  test("reads a directive, with its selector", () => {
    expect(read(`@Directive({ selector: "[item]" }) class Item {}`).declarations)
      .toEqual([{ name: "Item", kind: "directive", selector: "[item]", template: undefined, imports: [],
        exportAs: undefined,
        exportAsIsDynamic: false,
        members: [],

        inputNames: {},
        statementEnd: expect.any(Number),
      }]);
  });

  test("reads a template function's literal name, and the names of its own members", () => {
    const [declaration] = read(
      `@TemplateFunction("format") class Format { private n = 1; call(x) { return x; } static s = 2; }`,
    ).declarations;
    expect(declaration)
      .toMatchObject({ name: "Format", kind: "templateFunction", templateFunctionName: "format", members: ["n", "call"] });
  });

  test("reads an exportAs literal, and marks one that is not a literal as dynamic", () => {
    expect(read(`@Directive({ selector: "[item]", exportAs: "item" }) class Item {}`).declarations[0])
      .toMatchObject({ exportAs: "item", exportAsIsDynamic: false });
    expect(read(`@Directive({ selector: "[item]", exportAs: name }) class Item {}`).declarations[0])
      .toMatchObject({ exportAs: undefined, exportAsIsDynamic: true });
  });

  test("reads a template literal with no substitutions, and gives none for one with them", () => {
    expect(read("@Component({ template: `<p>a</p>` }) class A {}").declarations[0]!.template?.text)
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

  test("reads a constant of the file as the template or the selector", () => {
    const { declarations, constants } = readSource(`
      const html = "<p>x</p>";
      const sel = "[a]";
      @Component({ selector: sel, template: html }) class A {}
    `, "file.ts");
    expect(constants)
      .toEqual(new Map([["html", "<p>x</p>"], ["sel", "[a]"]]));
    expect(declarations[0])
      .toMatchObject({
        selector: "[a]",
        template: { text: "<p>x</p>", start: expect.any(Number), end: expect.any(Number) },
      });
  });

  test("a constant that is not a literal is not read, and a name of another file is a reference", () => {
    const { declarations, constants } = readSource(`
      const html = render();
      let other = "<p>no</p>";
      import { theme } from "./theme.ts";
      @Component({ selector: pick, template: theme }) class A {}
    `, "file.ts");
    expect(constants.size)
      .toBe(0);
    expect(declarations[0])
      .toMatchObject({
        selector: undefined,
        selectorName: "pick",
        template: undefined,
        templateRef: { name: "theme", start: expect.any(Number), end: expect.any(Number) },
      });
  });

  test("an exported constant is read too", () => {
    const { constants } = readSource(`export const page = "<p>x</p>";`, "file.ts");
    expect(constants.get("page"))
      .toBe("<p>x</p>");
  });

  test("a constant built from earlier constants, with + or a template with substitutions, is read", () => {
    const { constants } = readSource(`
      const open = "<p>";
      const body = open + "hi";
      const full = \`\${body}</p>\`;
    `, "file.ts");
    expect(constants.get("body"))
      .toBe("<p>hi");
    expect(constants.get("full"))
      .toBe("<p>hi</p>");
  });

  test("a constant that is not built from literals and constants is not read", () => {
    const { constants } = readSource(`
      const count = 1;
      const plain = "a";
      const minus = plain - "b";
      const number = plain + 1;
      const unknown = nowhere + "x";
      const template = \`\${nowhere}\`;
      const mixed = plain + \`\${count}\`;
    `, "file.ts");
    expect([...constants.keys()])
      .toEqual(["plain"]);
  });

  test("reads the input names of a class: an options object alone, or as the second argument", () => {
    const [declaration] = read(`
      @Component({ selector: "tk-a", template: "" })
      class A {
        readonly alone = input({ name: "one" });
        readonly second = input(1, { name: "two" });
        readonly first = input(1, { adapter: numberAdapter });
        readonly none = input();
        readonly value = input(1);
        readonly literal = input(name);
        readonly object = input({ name: "x" }, { adapter: numberAdapter });
        readonly notInput = other({ name: "y" });
        readonly plain = 3;
        ["computed"] = input(1, { name: "z" });
        method() {}
      }
    `).declarations;
    expect(declaration!.inputNames)
      .toEqual({ alone: "one", second: "two" });
  });

  test("reads a ForwardRef.of(() => Name) import as the name, so a component can import itself", () => {
    const [declaration] = read(
      `@Component({ selector: "tk-node", imports: [ForwardRef.of(() => TreeNode), Leaf] }) class TreeNode {}`,
    ).declarations;
    expect(declaration?.imports)
      .toEqual(["TreeNode", "Leaf"]);
  });

  test("a ForwardRef without a thunk gives no imports", () => {
    const [declaration] = read(`@Component({ imports: [ForwardRef.of()] }) class C {}`).declarations;
    expect(declaration?.imports)
      .toBeUndefined();
  });

  test("a ForwardRef whose thunk is not a plain name still gives no imports", () => {
    const [declaration] = read(
      `@Component({ imports: [ForwardRef.of(() => make())] }) class C {}`,
    ).declarations;
    expect(declaration?.imports)
      .toBeUndefined();
  });

  test("reads every class of the file: its members, and the class it extends", () => {
    const { classes } = read(`
      class Base { title = 1; static s = 2; greet() {} }
      export class Page extends Base { private n = 1; }
      class Other extends mixin(Base) {}
    `);
    expect(classes)
      .toEqual([
        { name: "Base", members: ["title", "greet"], extendsUnreadable: false },
        { name: "Page", members: ["n"], superClass: "Base", extendsUnreadable: false },
        { name: "Other", members: [], extendsUnreadable: true },
      ]);
  });
});

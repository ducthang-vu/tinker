import { describe, expect, test } from "vitest";
import { Maybe } from "@tinker/functional";
import type { Class } from "../../utils/types.ts";
import type { CompiledNode } from "../internal/template/compile.ts";
import { Selector } from "../internal/template/selector.ts";
import { compileSource, type ImportedSelector } from "./compile-source.ts";
import { emitCompiled } from "./emit.ts";

class Item {}
class Card {}

const imports: ImportedSelector[] = [
  { selector: "[item]", isComponent: false, type: Item },
  { selector: "tk-card", isComponent: true, type: Card },
];
const names = new Map<Class<object>, string>([[Item, "Item"], [Card, "Card"]]);

/** Compiles `source`, emits it, and evaluates the expression as a module would. */
function roundTrip(source: string, list: ImportedSelector[] = imports) {
  const nodes = compileSource(source, list)
    .getOrThrow();
  const code = emitCompiled(nodes, names);
  const build = new Function("Maybe", "Selector", "Item", "Card", `return ${code};`);
  return { nodes, code, rebuilt: build(Maybe, Selector, Item, Card) as unknown };
}

/** Evaluates an emitted expression. */
const evaluate = (code: string) => new Function("Maybe", "Selector", `return ${code};`)(Maybe, Selector);

describe("emitCompiled", () => {
  test("rebuilds an element with directives, bindings, a reference and a component", () => {
    const { nodes, rebuilt, code } = roundTrip(
      `<div item (click)="go()" [label]="name()" [class.done]="ok()" [style.width]="w()" [attr.role]="r()" #box>{{ count() }}</div><tk-card></tk-card>`,
    );
    expect(rebuilt)
      .toStrictEqual(nodes);
    expect(code)
      .toContain("Item");
  });

  test("rebuilds @if, @else, @match and @map blocks", () => {
    expect(roundTrip(`@if (ok()) { <p>yes</p> } @else { <p>no</p> }`).rebuilt)
      .toStrictEqual(roundTrip(`@if (ok()) { <p>yes</p> } @else { <p>no</p> }`).nodes);
    const match = `@match state() { @case "loading" { <p>wait</p> } @default { <p>ready</p> } }`;
    expect(roundTrip(match).rebuilt)
      .toStrictEqual(roundTrip(match).nodes);
    const list = `@map store.todos(); let todo; track todo.id { <li [class.done]="todo.done">{{ todo.title }}</li> }`;
    expect(roundTrip(list).rebuilt)
      .toStrictEqual(roundTrip(list).nodes);
  });

  test("the expression names a class, not a copy of it", () => {
    const { rebuilt, nodes } = roundTrip(`<div item></div>`);
    const element = (rebuilt as unknown[])[0] as { directives: unknown[] };
    expect(element.directives[0])
      .toBe(Item);
    expect(nodes)
      .toStrictEqual(rebuilt);
  });

  test("writes a Maybe, a Selector, numbers, booleans and null as their own values", () => {
    const code = emitCompiled([
      { kind: "value", some: Maybe.some(1), none: Maybe.none(), flag: false, nothing: null },
    ] as unknown as CompiledNode[], names);
    expect(evaluate(code))
      .toStrictEqual([{ kind: "value", some: Maybe.some(1), none: Maybe.none(), flag: false, nothing: null }]);
  });

  test("uses the helper names it is given", () => {
    const code = emitCompiled([{ some: Maybe.some(1), none: Maybe.none(), selector: Selector.parse("[a]")
      .getOrThrow() }] as unknown as CompiledNode[], names, { Maybe: "__M", Selector: "__S" });
    expect(code)
      .toContain("__M.some(1)");
    expect(code)
      .toContain("__S.parse(\"[a]\")");
  });

  test("writes a Selector by its source", () => {
    const selector = Selector.parse("tk-card[item]")
      .getOrThrow();
    expect(evaluate(emitCompiled([{ selector }] as unknown as CompiledNode[], names)))
      .toStrictEqual([{ selector }]);
  });

  test("keeps a field that is undefined, as the compiler sets some", () => {
    expect(evaluate(emitCompiled([{ owner: undefined }] as unknown as CompiledNode[], names)))
      .toStrictEqual([{ owner: undefined }]);
  });

  test("writes an array of plain values as it is", () => {
    expect(evaluate(emitCompiled([1, "a", true, null] as unknown as CompiledNode[], names)))
      .toStrictEqual([1, "a", true, null]);
  });

  test("is an error to emit a class that has no name in the module", () => {
    const nodes = compileSource(`<div item></div>`, imports)
      .getOrThrow();
    expect(() => emitCompiled(nodes, new Map()))
      .toThrow("Cannot emit the class Item: it has no name in the module");
  });

  test("names an anonymous class in the error", () => {
    const anonymous = Object.defineProperty(class {}, "name", { value: "" }) as Class<object>;
    expect(() => emitCompiled([{ type: anonymous }] as unknown as CompiledNode[], new Map()))
      .toThrow("Cannot emit the class (anonymous)");
  });

  test("is an error to emit a number that is not finite", () => {
    expect(() => emitCompiled([NaN] as unknown as CompiledNode[], names))
      .toThrow("Cannot emit NaN");
  });

  test("is an error to emit an object that is not plain data", () => {
    expect(() => emitCompiled([new Date(0)] as unknown as CompiledNode[], names))
      .toThrow("Cannot emit [object Date]");
  });

  test("is an error to emit a symbol", () => {
    expect(() => emitCompiled([Symbol("x")] as unknown as CompiledNode[], names))
      .toThrow("Cannot emit [object Symbol]");
  });
});

import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { Engine } from "../engine.ts";
import { Component } from "../authoring/decorators.ts";

/** Render `template` over `items` in an @map, and return the text of each row, in order. */
function rowsOf(template: string, items: readonly unknown[]): string[] {
  @Component({ selector: "tk-rows", template: `<ul>@map items(); let item { <li>${template}</li> }</ul>` })
  class Rows {
    readonly items = signal<readonly unknown[]>(items);
  }
  const el = document.createElement("section");
  const engine = Engine.create();
  engine.bootstrap(Rows, el);
  engine.flush();
  const rows = [...el.querySelectorAll("ul > li")].map((row) => row.textContent.trim());
  engine.destroy();
  return rows;
}

describe("patterns inside @map rows", () => {
  test("literals, null and truthy/falsy", () => {
    const template = "@match item { @case 0 { zero } @case \"x\" { x } @case null { nil } "
      + "@case truthy { yes } @default { other } }";
    expect(rowsOf(template, [0, "x", null, 5, ""]))
      .toEqual(["zero", "x", "nil", "yes", "other"]);
  });

  test("names, _, present and ranges", () => {
    expect(rowsOf("@match item { @case 0..12 { month {{ item }} } @default { other } }", [3, 20]))
      .toEqual(["month 3", "other"]);
    expect(rowsOf("@match item { @case present { here } @default { gone } }", [1, null, undefined]))
      .toEqual(["here", "gone", "gone"]);
    expect(rowsOf("@match item { @case value { got {{ value }} } }", ["a"]))
      .toEqual(["got a"]);
  });

  test("objects by shape, absent keys and nested objects", () => {
    expect(rowsOf("@match item { @case { tag: \"ok\", value } { ok {{ value }} } @default { err } }",
      [{ tag: "ok", value: 3 }, { tag: "no" }]))
      .toEqual(["ok 3", "err"]);
    expect(rowsOf("@match item { @case { error: absent } { fine } @default { bad } }",
      [{ value: 1 }, { error: "x" }]))
      .toEqual(["fine", "bad"]);
    expect(rowsOf("@match item { @case { user: { role: \"admin\" } } { admin } @default { user } }",
      [{ user: { role: "admin" } }, { user: { role: "guest" } }]))
      .toEqual(["admin", "user"]);
  });

  test("arrays: empty, fixed and rest", () => {
    expect(rowsOf("@match item { @case [] { none } @case [first, ...rest] { {{ first }} +{{ rest.length }} } }",
      [[], [1, 2, 3]]))
      .toEqual(["none", "1 +2"]);
  });

  test("alternatives and not", () => {
    expect(rowsOf("@match item { @case \"loading\" | \"saving\" { busy } @default { idle } }",
      ["saving", "done"]))
      .toEqual(["busy", "idle"]);
    expect(rowsOf("@match item { @case not \"guest\" { member } @default { guest } }",
      ["ann", "guest"]))
      .toEqual(["member", "guest"]);
  });

  test("a guard with when reads the row's own name", () => {
    expect(rowsOf("@match item { @case value when value > 2 { big } @default { small } }", [1, 5]))
      .toEqual(["small", "big"]);
  });

  test("an @if inside a row sees the row's name", () => {
    expect(rowsOf("@if (item) { yes } @else { no }", [1, 0]))
      .toEqual(["yes", "no"]);
  });
});

import { describe, expect, test } from "vitest";
import { ElementContext } from "./element-context.ts";
import { DomRenderer } from "../renderer.ts";
import { View } from "./view.ts";

const element = () => document.createElement("div");
const view = () => new View(element(), {}, [], new DomRenderer());

describe("ElementContext", () => {
  test("starts empty", () => {
    const el = element();
    const context = new ElementContext(el);
    expect(context.element)
      .toBe(el);
    expect(context.directives)
      .toEqual([]);
    expect(context.componentView.isNone())
      .toBe(true);
    expect(context.isEmpty)
      .toBe(true);
  });

  test("holds any number of directives, in order", () => {
    const context = new ElementContext(element());
    const tooltip = { name: "tooltip" };
    const highlight = { name: "highlight" };
    context.addDirective(tooltip);
    context.addDirective(highlight);
    expect(context.directives)
      .toEqual([tooltip, highlight]);
    expect(context.isEmpty)
      .toBe(false);
  });

  test("holds at most one component", () => {
    const context = new ElementContext(element());
    const first = view();
    context.attachComponent(first);
    expect(context.componentView.getOrElse(undefined))
      .toBe(first);
    expect(context.isEmpty)
      .toBe(false);
    expect(() => context.attachComponent(view()))
      .toThrow("The element already holds a component");
    expect(context.componentView.getOrElse(undefined))
      .toBe(first);
  });

  test("detachComponent frees the element for another component", () => {
    const context = new ElementContext(element());
    context.attachComponent(view());
    context.detachComponent();
    expect(context.componentView.isNone())
      .toBe(true);
    expect(context.isEmpty)
      .toBe(true);
    const next = view();
    context.attachComponent(next);
    expect(context.componentView.getOrElse(undefined))
      .toBe(next);
  });
});

describe("ElementContext.removeDirective", () => {
  test("takes a directive off, and ignores one that is not there", () => {
    const context = new ElementContext(element());
    const a = { name: "a" };
    const b = { name: "b" };
    context.addDirective(a);
    context.addDirective(b);
    context.removeDirective(a);
    context.removeDirective({ name: "not there" });
    expect(context.directives)
      .toEqual([b]);
    context.removeDirective(b);
    expect(context.isEmpty)
      .toBe(true);
  });
});

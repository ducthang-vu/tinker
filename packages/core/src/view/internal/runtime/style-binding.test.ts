import { describe, expect, test, vi } from "vitest";
import { signal } from "../../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { ExpressionParser } from "../template/expression.ts";
import { StyleBinding } from "./style-binding.ts";
import { Scope } from "../template/scope.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

const parse = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("StyleBinding", () => {
  test("sets the style property to the value, and changes it when the value changes", () => {
    const element = document.createElement("p");
    const color = signal<string | undefined>("red");
    const binding = new StyleBinding(element, "color", parse("color()"), new Scope({ color }), new DomRenderer());
    binding.update();
    expect(element.style.color)
      .toBe("red");
    color.set("blue");
    binding.update();
    expect(element.style.color)
      .toBe("blue");
  });

  test("an empty value removes the property: null, undefined, empty text and false", () => {
    for (const empty of [null, undefined, "", false]) {
      const element = document.createElement("p");
      element.style.color = "red";
      const value = signal<unknown>(empty);
      new StyleBinding(element, "color", parse("value()"), new Scope({ value }), new DomRenderer())
        .update();
      expect(element.style.color)
        .toBe("");
    }
  });

  test("numbers are written as text; custom properties work", () => {
    const element = document.createElement("p");
    const size = signal(12);
    new StyleBinding(element, "--size", parse("size()"), new Scope({ size }), new DomRenderer())
      .update();
    expect(element.style.getPropertyValue("--size"))
      .toBe("12");
  });

  test("writes the DOM only when the value changed; its key names the property", () => {
    const element = document.createElement("p");
    const renderer = new DomRenderer();
    const set = vi.spyOn(renderer, "setStyle");
    const color = signal("red");
    const binding = new StyleBinding(element, "color", parse("color()"), new Scope({ color }), renderer);
    binding.update();
    binding.update();
    expect(set)
      .toHaveBeenCalledTimes(1);
    expect(binding.key)
      .toBe("style:color");
  });

  test("an empty first value leaves the property unset, whatever the element had", () => {
    const element = document.createElement("p");
    const value = signal<unknown>(undefined);
    new StyleBinding(element, "color", parse("value()"), new Scope({ value }), new DomRenderer())
      .update();
    expect(element.style.color)
      .toBe("");
  });
});

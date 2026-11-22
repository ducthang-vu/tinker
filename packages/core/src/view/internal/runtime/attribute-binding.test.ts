import { describe, expect, test, vi } from "vitest";
import { signal } from "../../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { ExpressionParser } from "../template/expression.ts";
import { AttributeBinding } from "./attribute-binding.ts";
import { Scope } from "../template/scope.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional/v1";

const parse = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("AttributeBinding", () => {
  test("sets the attribute to the value, and changes it when the value changes", () => {
    const element = document.createElement("p");
    const title = signal("first");
    const binding = new AttributeBinding(element, "title", parse("title()"), new Scope({ title }), new DomRenderer());
    binding.update();
    expect(element.getAttribute("title"))
      .toBe("first");
    title.set("second");
    binding.update();
    expect(element.getAttribute("title"))
      .toBe("second");
  });

  test("true sets it with an empty value; false, null and undefined remove it", () => {
    const element = document.createElement("button");
    const flag = signal<unknown>(true);
    const binding = new AttributeBinding(element, "disabled", parse("flag()"), new Scope({ flag }), new DomRenderer());
    binding.update();
    expect(element.getAttribute("disabled"))
      .toBe("");
    flag.set(false);
    binding.update();
    expect(element.hasAttribute("disabled"))
      .toBe(false);
    flag.set(null);
    binding.update();
    flag.set(undefined);
    binding.update();
    expect(element.hasAttribute("disabled"))
      .toBe(false);
  });

  test("numbers and other values are written as text", () => {
    const element = document.createElement("div");
    const width = signal(200);
    new AttributeBinding(element, "data-width", parse("width()"), new Scope({ width }), new DomRenderer())
      .update();
    expect(element.getAttribute("data-width"))
      .toBe("200");
  });

  test("writes the DOM only when the value changed; its key names the attribute", () => {
    const element = document.createElement("p");
    const renderer = new DomRenderer();
    const set = vi.spyOn(renderer, "setAttribute");
    const title = signal("x");
    const binding = new AttributeBinding(element, "title", parse("title()"), new Scope({ title }), renderer);
    binding.update();
    binding.update();
    expect(set)
      .toHaveBeenCalledTimes(1);
    expect(binding.key)
      .toBe("attr:title");
  });

  test("a null first value leaves the attribute absent", () => {
    const element = document.createElement("p");
    const value = signal<unknown>(null);
    new AttributeBinding(element, "title", parse("value()"), new Scope({ value }), new DomRenderer())
      .update();
    expect(element.hasAttribute("title"))
      .toBe(false);
  });
});

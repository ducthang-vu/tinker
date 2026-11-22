import { describe, expect, test } from "vitest";
import { DomRenderer } from "../renderer.ts";
import { ExpressionParser } from "../template/expression.ts";
import { Scope } from "../template/scope.ts";
import { ClassMapBinding } from "./class-map-binding.ts";
import { match, Left, Right } from "@tinker/functional/v1";

type Value = Record<string, boolean> | null | string;

describe("ClassMapBinding", () => {
  test("adds the classes of the truthy keys and removes the ones that turn falsy", () => {
    const element = document.createElement("p");
    const component: { value: Value } = { value: { a: true, b: false } };
    const binding = new ClassMapBinding(element, match(ExpressionParser.parse("value"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), new Scope(component), new DomRenderer());
    binding.update();
    expect(element.className)
      .toBe("a");
    binding.update();
    expect(element.className)
      .toBe("a");
    component.value = { b: true };
    binding.update();
    expect(element.className)
      .toBe("b");
  });

  test("a null or non-object value sets no classes, and clears the ones it had", () => {
    const element = document.createElement("p");
    const component: { value: Value } = { value: { a: true } };
    const binding = new ClassMapBinding(element, match(ExpressionParser.parse("value"), { Left: (error) => {
      throw error;
    }, Right: (value) => value }), new Scope(component), new DomRenderer());
    binding.update();
    component.value = null;
    binding.update();
    expect(element.className)
      .toBe("");
    component.value = { a: true };
    binding.update();
    component.value = "text";
    binding.update();
    expect(element.className)
      .toBe("");
  });
});

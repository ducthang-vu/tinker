import { describe, expect, test, vi } from "vitest";
import { signal } from "../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { ExpressionParser } from "../template/expression.ts";
import { ClassBinding } from "./class-binding.ts";

describe("ClassBinding", () => {
  test("turns the class on while the expression is truthy, writing only changes", () => {
    const renderer = new DomRenderer();
    const add = vi.spyOn(renderer, "addClass");
    const remove = vi.spyOn(renderer, "removeClass");
    const element = document.createElement("p");
    const open = signal<unknown>(true);
    const binding = new ClassBinding(element, "open", ExpressionParser.parse("open()")
      .getOrThrow(), { open }, renderer);

    binding.update();
    binding.update();
    expect(element.className)
      .toBe("open");
    open.set("yes"); // still truthy: nothing to write
    binding.update();
    open.set(0);
    binding.update();
    expect(element.className)
      .toBe("");
    expect([add.mock.calls.length, remove.mock.calls.length])
      .toEqual([1, 1]);
  });

  test("a falsy first value removes nothing it did not add, but leaves other classes", () => {
    const element = document.createElement("p");
    element.className = "keep";
    new ClassBinding(element, "open", ExpressionParser.parse("open")
      .getOrThrow(), { open: false }, new DomRenderer())
      .update();
    expect(element.className)
      .toBe("keep");
  });
});

import { describe, expect, test, vi } from "vitest";
import { signal } from "../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { parseInterpolation } from "../template/interpolation.ts";
import { inject, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { RENDERER } from "../tokens.ts";
import { BindingFactory, TextBinding } from "./text-binding.ts";

function bind(text: string, component: object) {
  const renderer = new DomRenderer();
  const setText = vi.spyOn(renderer, "setText");
  const node = document.createTextNode("");
  const binding = new TextBinding(node, parseInterpolation(text)
    .getOrThrow(), component, renderer);
  return { binding, node, setText };
}

describe("TextBinding", () => {
  test("fills the text node with the strings and the values", () => {
    const { binding, node } = bind("{{ a() }} and {{ b }}!", { a: signal(1), b: "two" });
    binding.update();
    expect(node.data)
      .toBe("1 and two!");
  });

  test("shows null and undefined as nothing, anything else as a string", () => {
    const { binding, node } = bind("[{{ a }}|{{ b }}|{{ c }}|{{ d }}]", { a: null, b: undefined, c: 0, d: false });
    binding.update();
    expect(node.data)
      .toBe("[||0|false]");
  });

  test("writes the DOM only when the text changed", () => {
    const value = signal<unknown>("x");
    const { binding, setText } = bind("{{ value() }}", { value });
    binding.update();
    binding.update();
    value.set(undefined);
    binding.update();
    value.set(null); // same text: ""
    binding.update();
    expect(setText.mock.calls.map(([, text]) => text))
      .toEqual(["x", ""]);
  });
});

describe("BindingFactory", () => {
  test("creates text bindings using the app's renderer", () => {
    const renderer = new DomRenderer();
    const setText = vi.spyOn(renderer, "setText");
    const { injector } = Injector.create({
      providers: [provide(RENDERER, { useValue: renderer }), BindingFactory],
    });
    const factory = runInInjectionContext(injector, () => inject(BindingFactory));
    const node = document.createTextNode("");

    const binding = factory.text(node, parseInterpolation("{{ a }}")
      .getOrThrow(), { a: "x" });
    binding.update();

    expect(binding)
      .toBeInstanceOf(TextBinding);
    expect(setText)
      .toHaveBeenCalledWith(node, "x");
  });
});

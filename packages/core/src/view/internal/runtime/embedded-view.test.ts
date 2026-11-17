import { describe, expect, test, vi } from "vitest";
import { DomRenderer } from "../renderer.ts";
import { ElementContext } from "./element-context.ts";
import { EmbeddedView } from "./embedded-view.ts";

describe("EmbeddedView", () => {
  test("is destroyed once destroy is called, and removes its nodes", () => {
    const parent = document.createElement("section");
    const text = document.createTextNode("hi");
    parent.append(text);
    const view = new EmbeddedView(parent, [text], new DomRenderer());
    expect(view.destroyed)
      .toBe(false);
    view.destroy();
    expect(view.destroyed)
      .toBe(true);
    expect(parent.childNodes)
      .toHaveLength(0);
    view.destroy();
  });

  test("a callback added after destroy runs right away", () => {
    const view = new EmbeddedView(document.createElement("div"), [], new DomRenderer());
    view.destroy();
    const callback = vi.fn();
    view.addDestroyCallback(callback);
    expect(callback)
      .toHaveBeenCalledTimes(1);
  });

  test("records the inputs of its directives and its elements", () => {
    const view = new EmbeddedView(document.createElement("div"), [], new DomRenderer());
    const directive = {};
    view.addInputs(directive, new Map());
    view.addElement(new ElementContext(document.createElement("p")));
    view.destroy();
  });
});

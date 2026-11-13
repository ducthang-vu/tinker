import { describe, expect, test } from "vitest";
import { DomRenderer } from "./renderer.ts";
import { ElementContexts } from "./element-contexts.ts";
import { View } from "./view.ts";

describe("ElementContexts", () => {
  test("get is undefined for an element with no context", () => {
    expect(new ElementContexts().get(document.createElement("div"))).toBeUndefined();
  });

  test("getOrCreate creates a context once, then returns the same one", () => {
    const contexts = new ElementContexts();
    const element = document.createElement("div");
    const context = contexts.getOrCreate(element);
    expect(context.element).toBe(element);
    expect(contexts.getOrCreate(element)).toBe(context);
    expect(contexts.get(element)).toBe(context);
  });

  test("forgetIfEmpty forgets an empty context, and keeps a non-empty one", () => {
    const contexts = new ElementContexts();
    const empty = contexts.getOrCreate(document.createElement("p"));
    const busy = contexts.getOrCreate(document.createElement("tk-x"));
    busy.attachComponent(new View(busy.element, {}, [], new DomRenderer()));

    contexts.forgetIfEmpty(empty);
    contexts.forgetIfEmpty(busy);

    expect(contexts.get(empty.element)).toBeUndefined();
    expect(contexts.get(busy.element)).toBe(busy);
  });
});

import { describe, expect, test, vi } from "vitest";
import { DomRenderer } from "./renderer.ts";

const renderer = new DomRenderer();

describe("DomRenderer", () => {
  test("uses the global document by default, or the one it is given", () => {
    const other = document.implementation.createHTMLDocument("other");
    expect(renderer.createElement("div").ownerDocument).toBe(document);
    expect(new DomRenderer(other).createElement("div").ownerDocument).toBe(other);
  });

  test("creates elements, text and comments", () => {
    expect(renderer.createElement("section").tagName).toBe("SECTION");
    expect(renderer.createText("hi").data).toBe("hi");
    expect(renderer.createComment("marker").data).toBe("marker");
  });

  test("builds and changes the tree", () => {
    const parent = renderer.createElement("ul");
    const a = renderer.createElement("li");
    const b = renderer.createElement("li");
    const c = renderer.createElement("li");
    renderer.appendChild(parent, a);
    renderer.insertBefore(parent, b, a);
    renderer.insertBefore(parent, c, null);
    expect([...parent.childNodes]).toEqual([b, a, c]);
    renderer.removeChild(parent, a);
    expect([...parent.childNodes]).toEqual([b, c]);
  });

  test("sets text", () => {
    const text = renderer.createText("old");
    renderer.setText(text, "new");
    expect(text.data).toBe("new");
  });

  test("sets and removes attributes", () => {
    const el = renderer.createElement("a");
    renderer.setAttribute(el, "href", "/home");
    expect(el.getAttribute("href")).toBe("/home");
    renderer.removeAttribute(el, "href");
    expect(el.hasAttribute("href")).toBe(false);
  });

  test("sets properties, not attributes", () => {
    const input = renderer.createElement("input") as HTMLInputElement;
    renderer.setProperty(input, "value", "typed");
    expect(input.value).toBe("typed");
    expect(input.hasAttribute("value")).toBe(false);
  });

  test("adds and removes classes", () => {
    const el = renderer.createElement("div");
    renderer.addClass(el, "active");
    expect(el.classList.contains("active")).toBe(true);
    renderer.removeClass(el, "active");
    expect(el.classList.contains("active")).toBe(false);
  });

  test("sets and removes styles", () => {
    const el = renderer.createElement("div") as HTMLElement;
    renderer.setStyle(el, "background-color", "yellow");
    expect(el.style.getPropertyValue("background-color")).toBe("yellow");
    renderer.removeStyle(el, "background-color");
    expect(el.style.getPropertyValue("background-color")).toBe("");
  });

  test("listens to events and returns a function that stops listening", () => {
    const button = renderer.createElement("button") as HTMLButtonElement;
    const handler = vi.fn();
    const stop = renderer.listen(button, "click", handler);
    button.click();
    stop();
    button.click();
    expect(handler).toHaveBeenCalledOnce();
  });
});

import { describe, expect, test, vi } from "vitest";
import { h, mount } from "../src/dom.ts";
import { signal } from "../src/signal.ts";

describe("h", () => {
  test("creates elements with props and children", () => {
    const el = h("a", { href: "/home", title: "Home" }, "Go ", "home");
    expect(el.tagName)
      .toBe("A");
    expect(el.getAttribute("href"))
      .toBe("/home");
    expect(el.title)
      .toBe("Home");
    expect(el.textContent)
      .toBe("Go home");
  });

  test("skips null, undefined and false children and flattens arrays", () => {
    const el = h("ul", null, [h("li", null, "a"), null, false, [h("li", null, "b")]]);
    expect(el.children)
      .toHaveLength(2);
    expect(el.textContent)
      .toBe("ab");
  });

  test("attaches event listeners", () => {
    const onClick = vi.fn();
    const el = h("button", { onClick });
    el.click();
    expect(onClick)
      .toHaveBeenCalledOnce();
  });

  test("updates reactive text in place", () => {
    const name = signal("Ada");
    const el = h("p", null, "Hi ", name);
    const textNode = el.lastChild;
    name.set("Grace");
    expect(el.textContent)
      .toBe("Hi Grace");
    expect(el.lastChild)
      .toBe(textNode); // same node, not re-created
  });

  test("updates reactive props", () => {
    const cls = signal("off");
    const el = h("div", { className: cls });
    cls.set("on");
    expect(el.className)
      .toBe("on");
  });

  test("renders function components", () => {
    const Greeting = (props: { name: string }) => h("span", null, "Hello ", props.name);
    const el = h(Greeting, { name: "Tinker" });
    expect(el.textContent)
      .toBe("Hello Tinker");
  });
});

describe("mount", () => {
  test("replaces the target's contents", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>old</p>";
    mount(() => h("p", null, "new"), root);
    expect(root.innerHTML)
      .toBe("<p>new</p>");
  });
});

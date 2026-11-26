import { describe, expect, test } from "vitest";
import { ElementContext } from "./element-context.ts";
import { input, inputsOf } from "../authoring/input.ts";
import { watch } from "../../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { ComponentView } from "./component-view.ts";
import { messageOf } from "../test-support.ts";
import { isNone, getOrElse } from "@tinker/functional";

function makeView() {
  const host = document.createElement("div");
  const kept = document.createElement("span");
  host.append(kept);
  const nodes = [document.createElement("p"), document.createTextNode("text")];
  host.append(...nodes);
  const component = { name: "component" };
  const view = new ComponentView(host, component, nodes, new DomRenderer(), {});
  return { view, host, kept, nodes, component };
}

describe("ComponentView", () => {
  test("records the inputs of its directives, and finds one by directive and name", () => {
    const { view } = makeView();
    class Tooltip {
      readonly text = input<string>();
    }
    const tooltip = new Tooltip();
    const inputs = inputsOf(tooltip);
    view.addInputs(tooltip, inputs);

    expect(getOrElse(view.input(tooltip, "text"), undefined))
      .toBe(inputs.get("text"));
    expect(isNone(view.input(tooltip, "other")))
      .toBe(true);
    expect(isNone(view.input(new Tooltip(), "text")))
      .toBe(true);
  });

  test("holds its host, component and nodes", () => {
    const { view, host, nodes, component } = makeView();
    expect(view.host)
      .toBe(host);
    expect(view.component)
      .toBe(component);
    expect(view.nodes)
      .toEqual(nodes);
    expect(view.destroyed)
      .toBe(false);
  });

  describe("setInput", () => {
    class Card {
      readonly title = input<string>();
      readonly size = input(1);
      readonly plain = "not an input";
    }
    function cardView() {
      const card = new Card();
      const view = new ComponentView(document.createElement("div"), card, [], new DomRenderer(), {});
      view.addInputs(card, inputsOf(card));
      return { card, view };
    }

    test("binds the component's input, and readers see it like any signal", () => {
      const { card, view } = cardView();
      const seen: number[] = [];
      watch(() => void seen.push(card.size()), { schedule: (task) => task.run() });

      view.setInput("title", "Hello");
      view.setInput("size", 2);

      expect(card.title())
        .toBe("Hello");
      expect(seen)
        .toEqual([1, 2]);
    });

    test("fails for a name that is not an input of the component, and sets nothing", () => {
      const { view } = cardView();
      expect(messageOf(view.setInput("missing" as never, "x" as never)))
        .toBe(`Card has no input "missing"`);
    });

    test("checks the input's name and value type", () => {
      const { view } = cardView();
      // @ts-expect-error "plain" is not an input
      expect(messageOf(view.setInput("plain", "x")))
        .toBe(`Card has no input "plain"`);
      // @ts-expect-error size takes a number
      view.setInput("size", "big");
    });
  });

  test("destroy removes only its own nodes from the host", () => {
    const { view, host, kept } = makeView();
    view.destroy();
    expect([...host.childNodes])
      .toEqual([kept]);
    expect(view.destroyed)
      .toBe(true);
  });

  test("destroy runs the callbacks, most recent first, before removing nodes", () => {
    const { view, host } = makeView();
    const log: string[] = [];
    view.addDestroyCallback(() => log.push(`first (children: ${host.childNodes.length})`));
    view.addDestroyCallback(() => log.push("second"));
    view.destroy();
    expect(log)
      .toEqual(["second", "first (children: 3)"]);
  });

  test("destroying twice does nothing the second time", () => {
    const { view } = makeView();
    let calls = 0;
    view.addDestroyCallback(() => calls++);
    view.destroy();
    view.destroy();
    expect(calls)
      .toBe(1);
  });

  test("records the contexts of the elements in its template", () => {
    const { view } = makeView();
    const a = new ElementContext(document.createElement("h1"));
    const b = new ElementContext(document.createElement("p"));
    view.addElement(a);
    view.addElement(b);
    expect(view.elements)
      .toEqual([a, b]);
  });

  test("destroy first destroys the views of components on its elements", () => {
    const { view } = makeView();
    const childHost = document.createElement("tk-child");
    const child = new ComponentView(childHost, {}, [], new DomRenderer(), {});
    const context = new ElementContext(childHost);
    context.attachComponent(child);
    view.addElement(context);
    view.addElement(new ElementContext(document.createElement("p"))); // no component
    const log: string[] = [];
    child.addDestroyCallback(() => log.push("child"));
    view.addDestroyCallback(() => log.push("parent"));

    view.destroy();

    expect(child.destroyed)
      .toBe(true);
    expect(log)
      .toEqual(["child", "parent"]);
  });

  test("addDestroyCallback on an already destroyed view runs the callback right away", () => {
    const { view } = makeView();
    view.destroy();
    let ran = false;
    view.addDestroyCallback(() => (ran = true));
    expect(ran)
      .toBe(true);
  });
});

describe("RenderScope", () => {
  test("destroying a render scope runs its own callbacks, most recent first, and not the view's", () => {
    const { view } = makeView();
    const log: string[] = [];
    view.addDestroyCallback(() => log.push("view"));
    const scope = view.renderScope();
    scope.addDestroyCallback(() => log.push("first"));
    scope.addDestroyCallback(() => log.push("second"));
    scope.destroy();
    expect(log)
      .toEqual(["second", "first"]);
    scope.destroy();
    expect(log)
      .toEqual(["second", "first"]);
  });

  test("a callback added after the scope is destroyed runs right away", () => {
    const { view } = makeView();
    const scope = view.renderScope();
    scope.destroy();
    const log: string[] = [];
    scope.addDestroyCallback(() => log.push("late"));
    expect(log)
      .toEqual(["late"]);
  });

  test("inputs recorded through a scope are found on the component's view", () => {
    const { view } = makeView();
    const scope = view.renderScope();
    class Tooltip {
      readonly text = input<string>();
    }
    const tooltip = new Tooltip();
    scope.addInputs(tooltip, inputsOf(tooltip));
    expect(isNone(view.input(tooltip, "text")))
      .toBe(false);
  });

  test("destroying the view destroys its scopes, once", () => {
    const { view } = makeView();
    const log: string[] = [];
    const scope = view.renderScope();
    scope.addDestroyCallback(() => log.push("scope"));
    view.destroy();
    expect(log)
      .toEqual(["scope"]);
    view.destroy();
    expect(log)
      .toEqual(["scope"]);
  });

  test("destroying a scope removes no node of the view, and destroying the view removes them", () => {
    const { view, host, kept, nodes } = makeView();
    const scope = view.renderScope();
    scope.destroy();
    expect(host.contains(kept))
      .toBe(true);
    expect(nodes.every((node) => host.contains(node)))
      .toBe(true);
    view.destroy();
    expect(nodes.some((node) => host.contains(node)))
      .toBe(false);
  });

  test("the component views of the elements recorded in a scope are destroyed with it", () => {
    const { view } = makeView();
    const scope = view.renderScope();
    const context = new ElementContext(document.createElement("section"));
    const child = new ComponentView(document.createElement("div"), {}, [], new DomRenderer(), {});
    context.attachComponent(child);
    scope.addElement(context);
    scope.destroy();
    expect(child.destroyed)
      .toBe(true);
  });
});

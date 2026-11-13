import { describe, expect, test } from "vitest";
import { ElementContext } from "./element-context.ts";
import { input, inputsOf } from "./input.ts";
import { DomRenderer } from "./renderer.ts";
import { View } from "./view.ts";

function makeView() {
  const host = document.createElement("div");
  const kept = document.createElement("span");
  host.append(kept);
  const nodes = [document.createElement("p"), document.createTextNode("text")];
  host.append(...nodes);
  const component = { name: "component" };
  return { view: new View(host, component, nodes, new DomRenderer()), host, kept, nodes, component };
}

describe("View", () => {
  test("records the inputs of its directives, and finds one by directive and name", () => {
    const { view } = makeView();
    class Tooltip {
      readonly text = input<string>();
    }
    const tooltip = new Tooltip();
    const inputs = inputsOf(tooltip);
    view.addInputs(tooltip, inputs);

    expect(view.input(tooltip, "text").getOrElse(undefined)).toBe(inputs.get("text"));
    expect(view.input(tooltip, "other").isNone()).toBe(true);
    expect(view.input(new Tooltip(), "text").isNone()).toBe(true);
  });

  test("holds its host, component and nodes", () => {
    const { view, host, nodes, component } = makeView();
    expect(view.host).toBe(host);
    expect(view.component).toBe(component);
    expect(view.nodes).toEqual(nodes);
    expect(view.destroyed).toBe(false);
  });

  test("destroy removes only its own nodes from the host", () => {
    const { view, host, kept } = makeView();
    view.destroy();
    expect([...host.childNodes]).toEqual([kept]);
    expect(view.destroyed).toBe(true);
  });

  test("destroy runs the callbacks, most recent first, before removing nodes", () => {
    const { view, host } = makeView();
    const log: string[] = [];
    view.addDestroyCallback(() => log.push(`first (children: ${host.childNodes.length})`));
    view.addDestroyCallback(() => log.push("second"));
    view.destroy();
    expect(log).toEqual(["second", "first (children: 3)"]);
  });

  test("destroying twice does nothing the second time", () => {
    const { view } = makeView();
    let calls = 0;
    view.addDestroyCallback(() => calls++);
    view.destroy();
    view.destroy();
    expect(calls).toBe(1);
  });

  test("records the contexts of the elements in its template", () => {
    const { view } = makeView();
    const a = new ElementContext(document.createElement("h1"));
    const b = new ElementContext(document.createElement("p"));
    view.addElement(a);
    view.addElement(b);
    expect(view.elements).toEqual([a, b]);
  });

  test("destroy first destroys the views of components on its elements", () => {
    const { view } = makeView();
    const childHost = document.createElement("tk-child");
    const child = new View(childHost, {}, [], new DomRenderer());
    const context = new ElementContext(childHost);
    context.attachComponent(child);
    view.addElement(context);
    view.addElement(new ElementContext(document.createElement("p"))); // no component
    const log: string[] = [];
    child.addDestroyCallback(() => log.push("child"));
    view.addDestroyCallback(() => log.push("parent"));

    view.destroy();

    expect(child.destroyed).toBe(true);
    expect(log).toEqual(["child", "parent"]);
  });

  test("addDestroyCallback on an already destroyed view runs the callback right away", () => {
    const { view } = makeView();
    view.destroy();
    let ran = false;
    view.addDestroyCallback(() => (ran = true));
    expect(ran).toBe(true);
  });
});

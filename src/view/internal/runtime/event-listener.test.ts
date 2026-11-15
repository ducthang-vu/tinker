import { describe, expect, test } from "vitest";
import { DomRenderer } from "../renderer.ts";
import type { EventModifier } from "../template/event-modifiers.ts";
import { listenWithModifiers } from "./event-listener.ts";

function setup(modifiers: readonly EventModifier[]) {
  const parent = document.createElement("div");
  const button = document.createElement("button");
  const child = document.createElement("span");
  button.append(child);
  parent.append(button);
  const calls: Event[] = [];
  const stop = listenWithModifiers(new DomRenderer(), button, { event: "click", modifiers }, (event) => {
    calls.push(event);
  });
  const outer: Event[] = [];
  parent.addEventListener("click", (event) => outer.push(event));
  return { button, child, calls, outer, stop };
}

describe("listenWithModifiers", () => {
  test("without modifiers, the handler gets every event", () => {
    const { button, calls } = setup([]);
    button.click();
    expect(calls)
      .toHaveLength(1);
  });

  test("prevent cancels the default action; stop keeps the event from bubbling", () => {
    const { button, outer } = setup(["prevent", "stop"]);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented)
      .toBe(true);
    expect(outer)
      .toHaveLength(0);
  });

  test("without stop, the event still bubbles", () => {
    const { button, outer } = setup([]);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(outer)
      .toHaveLength(1);
  });

  test("self ignores events from children, and runs for the element itself", () => {
    const { button, child, calls } = setup(["self"]);
    child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls)
      .toHaveLength(0);
    button.click();
    expect(calls)
      .toHaveLength(1);
  });

  test("once ends the listener after the first event", () => {
    const { button, calls } = setup(["once"]);
    button.click();
    button.click();
    expect(calls)
      .toHaveLength(1);
  });

  test("once counts only events that passed self", () => {
    const { button, child, calls } = setup(["self", "once"]);
    child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls)
      .toHaveLength(0);
    button.click();
    button.click();
    expect(calls)
      .toHaveLength(1);
  });

  test("the returned function removes the listener", () => {
    const { button, calls, stop } = setup([]);
    stop();
    button.click();
    expect(calls)
      .toHaveLength(0);
  });
});

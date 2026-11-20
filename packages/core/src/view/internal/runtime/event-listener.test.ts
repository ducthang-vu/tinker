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

  test("ctrl runs the handler only while Ctrl is held", () => {
    const { button, calls } = setup(["ctrl"]);
    button.dispatchEvent(new MouseEvent("click"));
    button.dispatchEvent(new MouseEvent("click", { ctrlKey: true }));
    expect(calls)
      .toHaveLength(1);
  });

  test("several system modifiers all have to be held", () => {
    const { button, calls } = setup(["ctrl", "shift"]);
    button.dispatchEvent(new MouseEvent("click", { ctrlKey: true }));
    button.dispatchEvent(new MouseEvent("click", { ctrlKey: true, shiftKey: true, altKey: true }));
    expect(calls)
      .toHaveLength(1);
  });

  test("cmd is the meta key, and alt and shift are their own keys", () => {
    const { button, calls } = setup(["cmd", "alt", "shift"]);
    button.dispatchEvent(new MouseEvent("click", { metaKey: true, altKey: true }));
    button.dispatchEvent(new MouseEvent("click", { metaKey: true, altKey: true, shiftKey: true }));
    expect(calls)
      .toHaveLength(1);
  });

  test("!ctrl runs the handler only while Ctrl is not held", () => {
    const { button, calls } = setup(["!ctrl"]);
    button.dispatchEvent(new MouseEvent("click", { ctrlKey: true }));
    button.dispatchEvent(new MouseEvent("click"));
    expect(calls)
      .toHaveLength(1);
  });

  test("a negated and a required modifier combine: (click.cmd.!shift)", () => {
    const { button, calls } = setup(["cmd", "!shift"]);
    button.dispatchEvent(new MouseEvent("click", { metaKey: true, shiftKey: true }));
    button.dispatchEvent(new MouseEvent("click", { metaKey: true, altKey: true }));
    button.dispatchEvent(new MouseEvent("click"));
    expect(calls)
      .toHaveLength(1);
  });

  test("modified runs the handler only while Ctrl, Shift, Alt or Meta is held", () => {
    const { button, calls } = setup(["modified"]);
    button.dispatchEvent(new MouseEvent("click"));
    button.dispatchEvent(new MouseEvent("click", { altKey: true }));
    button.dispatchEvent(new MouseEvent("click", { metaKey: true }));
    expect(calls)
      .toHaveLength(2);
  });

  test("primary runs the handler for the left button only", () => {
    const { button, calls } = setup(["primary"]);
    button.dispatchEvent(new MouseEvent("click", { button: 0 }));
    button.dispatchEvent(new MouseEvent("click", { button: 2 }));
    expect(calls)
      .toHaveLength(1);
  });

  test("secondary runs the handler for the right button, and ignores keyboard events", () => {
    const { button, calls } = setup(["secondary"]);
    button.dispatchEvent(new MouseEvent("click", { button: 2 }));
    button.dispatchEvent(new MouseEvent("click", { button: 0 }));
    button.dispatchEvent(new KeyboardEvent("click", { key: "Enter" }));
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

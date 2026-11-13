import { describe, expect, test, vi } from "vitest";
import { DomRenderer } from "../renderer.ts";
import { View } from "../runtime/view.ts";
import { HostBindings } from "./host-bindings.ts";

const renderer = new DomRenderer();
const makeView = (host: Element) => new View(host, {}, [], renderer);

describe("HostBindings parsing", () => {
  test("parses listeners with and without $event", () => {
    const bindings = new HostBindings({ "(click)": "toggle()", "(keydown)": "onKey($event)" });
    expect(bindings.listeners)
      .toEqual([
        { event: "click", method: "toggle", passEvent: false },
        { event: "keydown", method: "onKey", passEvent: true },
      ]);
  });

  test("allows spaces, and has no listeners without a host option", () => {
    expect(new HostBindings({ "(click)": "  go( $event )  " }).listeners)
      .toEqual([
        { event: "click", method: "go", passEvent: true },
      ]);
    expect(new HostBindings().listeners)
      .toEqual([]);
  });

  test("rejects other kinds of host bindings", () => {
    expect(() => new HostBindings({ "[class.open]": "open()" }))
      .toThrow(
        `Unsupported host binding "[class.open]": only "(event)" listeners are supported for now`,
      );
    expect(() => new HostBindings({ click: "go()" }))
      .toThrow("Unsupported host binding");
  });

  test("rejects handlers other than method() and method($event)", () => {
    for (const handler of ["open = !open", "go", "go(1)", "a.b()", "go($event, 1)"]) {
      expect(() => new HostBindings({ "(click)": handler }))
        .toThrow(
          `Unsupported host handler "${handler}": write "method()" or "method($event)"`,
        );
    }
  });

  test("reports every invalid entry at once", () => {
    let thrown: unknown;
    try {
      new HostBindings({ "[title]": "x()", "(click)": "go()", "(keyup)": "a.b()" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown)
      .toBeInstanceOf(AggregateError);
    const { errors, message } = thrown as AggregateError;
    expect(errors)
      .toHaveLength(2);
    expect(message)
      .toBe(
        `Unsupported host binding "[title]": only "(event)" listeners are supported for now\n`
        + `Unsupported host handler "a.b()": write "method()" or "method($event)"`,
      );
  });
});

describe("HostBindings.attach", () => {
  test("calls the method on the event, with or without it, bound to the instance", () => {
    const element = document.createElement("button");
    const calls: unknown[] = [];
    const instance = {
      name: "me",
      toggle(this: { name: string }) {
        calls.push(["toggle", this.name]);
      },
      onKey(event: Event) {
        calls.push(["onKey", event.type]);
      },
    };
    new HostBindings({ "(click)": "toggle()", "(keydown)": "onKey($event)" })
      .attach(
        instance,
        element,
        renderer,
        makeView(element),
      );
    element.click();
    element.dispatchEvent(new KeyboardEvent("keydown"));
    expect(calls)
      .toEqual([
        ["toggle", "me"],
        ["onKey", "keydown"],
      ]);
  });

  test("removes the listeners when the view is destroyed", () => {
    const element = document.createElement("button");
    const toggle = vi.fn();
    const view = makeView(element);
    new HostBindings({ "(click)": "toggle()" })
      .attach({ toggle }, element, renderer, view);
    view.destroy();
    element.click();
    expect(toggle).not.toHaveBeenCalled();
  });

  test("throws if the instance has no such method", () => {
    class Toggle {}
    const element = document.createElement("div");
    expect(() =>
      new HostBindings({ "(click)": "toggle()" })
        .attach(new Toggle(), element, renderer, makeView(element)),
    )
      .toThrow(`Toggle has no method "toggle" for host listener "(click)"`);
  });
});

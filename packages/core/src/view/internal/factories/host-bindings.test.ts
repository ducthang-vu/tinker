import { describe, expect, test, vi } from "vitest";
import { DomRenderer } from "../renderer.ts";
import { ComponentView } from "../runtime/component-view.ts";
import { ExpressionParser } from "../template/expression.ts";
import { HostBindings } from "./host-bindings.ts";

const renderer = new DomRenderer();
const makeView = (host: Element) => new ComponentView(host, {}, [], renderer, {});

describe("HostBindings parsing", () => {
  test("parses listeners with and without $event", () => {
    const bindings = new HostBindings({ "(click)": "toggle()", "(keydown)": "onKey($event)" });
    expect(bindings.listeners)
      .toEqual([
        { event: "click", modifiers: [], handler: expect.objectContaining({ method: "toggle" }) },
        { event: "keydown", modifiers: [], handler: expect.objectContaining({ method: "onKey" }) },
      ]);
  });

  test("allows spaces, and has no listeners without a host option", () => {
    expect(new HostBindings({ "(click)": "  go( $event )  " }).listeners)
      .toEqual([
        { event: "click", modifiers: [], handler: expect.objectContaining({ method: "go" }) },
      ]);
    expect(new HostBindings().listeners)
      .toEqual([]);
  });

  test("rejects other kinds of host bindings", () => {
    expect(() => new HostBindings({ "[title]": "open()" }))
      .toThrow(
        "Unsupported host binding \"[title]\": only \"(event)\" listeners and "
        + "\"[class.name]\", \"[style.name]\" and \"[attr.name]\" bindings are supported for now",
      );
    expect(() => new HostBindings({ click: "go()" }))
      .toThrow("Unsupported host binding");
  });

  test("parses class bindings, keeping the class's case", () => {
    const bindings = new HostBindings({ "[class.isOpen]": "open()", "(click)": "toggle()" });
    expect(bindings.classes.map(({ name }) => name))
      .toEqual(["isOpen"]);
    expect(bindings.classes[0]!.expression)
      .toEqual(ExpressionParser.parse("open()")
        .getOrThrow());
    expect(bindings.listeners.map(({ event }) => event))
      .toEqual(["click"]);
  });

  test("reports an invalid class binding expression with its key", () => {
    expect(() => new HostBindings({ "[class.open]": "a(1 2)" }))
      .toThrow(`Expected "," or ")", found "2" (at column 5 in "a(1 2)"), `
        + `in host binding "[class.open]"`);
  });

  test("parses style and attribute bindings, attr mapping to the attribute kind", () => {
    const bindings = new HostBindings({
      "[style.--highlight]": "color()",
      "[style.font-size]": "size()",
      "[attr.role]": "role()",
    });
    expect(bindings.styles.map(({ name }) => name))
      .toEqual(["--highlight", "font-size"]);
    expect(bindings.attributes.map(({ kind, name }) => [kind, name]))
      .toEqual([["attribute", "role"]]);
    expect(bindings.classes)
      .toEqual([]);
  });

  test("reports an invalid style or attribute expression with its key", () => {
    expect(() => new HostBindings({ "[attr.title]": "a(1 2)" }))
      .toThrow(`in host binding "[attr.title]"`);
  });

  test("rejects handlers other than method() and method($event)", () => {
    for (const handler of ["go", "a.b()", "open.toggle"]) {
      expect(() => new HostBindings({ "(click)": handler }))
        .toThrow(
          `Unsupported host handler "${handler}": write a call of a method, as in "method()" or "method($event)"`,
        );
    }
    expect(() => new HostBindings({ "(click)": "open = !open" }))
      .toThrow(`Unsupported host handler "open = !open": `);
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
        "Unsupported host binding \"[title]\": only \"(event)\" listeners and "
        + "\"[class.name]\", \"[style.name]\" and \"[attr.name]\" bindings are supported for now\n"
        + `Unsupported host handler "a.b()": write a call of a method, as in "method()" or "method($event)"`,
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

describe("HostBindings handlers with event fields", () => {
  test("a listener can pass a field of the event, as a($event.someprop)", () => {
    const element = document.createElement("input");
    const seen: unknown[] = [];
    const instance = {
      select(value: unknown) {
        seen.push(value);
      },
    };
    new HostBindings({ "(input)": "select($event.target)" })
      .attach(instance, element, renderer, makeView(element));
    element.dispatchEvent(new Event("input"));
    expect(seen)
      .toEqual([element]);
  });
});

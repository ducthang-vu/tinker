import { describe, expect, test, vi } from "vitest";
import { DomRenderer } from "../renderer.ts";
import { ComponentView } from "../runtime/component-view.ts";
import { ExpressionParser } from "../template/expression.ts";
import { HostBindings } from "./host-bindings.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

/** The bindings of a host option; throws (as the old constructor did) when it is invalid. */
const bindingsOf = (host?: Readonly<Record<string, string>>): HostBindings =>
  valueOrThrow(HostBindings.parse(host));

const renderer = new DomRenderer();
const makeView = (host: Element) => new ComponentView(host, {}, [], renderer, {});

describe("HostBindings parsing", () => {
  test("parse is a Left, holding one error per invalid entry", () => {
    const result = HostBindings.parse({ "[title]": "open()", "(click)": "go" });
    expect(match(result, { Left: () => true, Right: () => false }))
      .toBe(true);
    const errors = match(result, { Left: (error) => error.errors, Right: () => [] });
    expect(errors)
      .toHaveLength(2);
  });

  test("parses listeners with and without $event", () => {
    const bindings = bindingsOf({ "(click)": "toggle()", "(keydown)": "onKey($event)" });
    expect(bindings.listeners)
      .toEqual([
        { event: "click", modifiers: [], handler: expect.objectContaining({ method: "toggle" }) },
        { event: "keydown", modifiers: [], handler: expect.objectContaining({ method: "onKey" }) },
      ]);
  });

  test("allows spaces, and has no listeners without a host option", () => {
    expect(bindingsOf({ "(click)": "  go( $event )  " }).listeners)
      .toEqual([
        { event: "click", modifiers: [], handler: expect.objectContaining({ method: "go" }) },
      ]);
    expect(bindingsOf().listeners)
      .toEqual([]);
  });

  test("rejects other kinds of host bindings", () => {
    expect(() => bindingsOf({ "[title]": "open()" }))
      .toThrow(
        "Unsupported host binding \"[title]\": only \"(event)\" listeners and "
        + "\"[class.name]\", \"[style.name]\" and \"[attr.name]\" bindings are supported for now",
      );
    expect(() => bindingsOf({ click: "go()" }))
      .toThrow("Unsupported host binding");
  });

  test("parses class bindings, keeping the class's case", () => {
    const bindings = bindingsOf({ "[class.isOpen]": "open()", "(click)": "toggle()" });
    expect(bindings.classes.map(({ name }) => name))
      .toEqual(["isOpen"]);
    expect(bindings.classes[0]!.expression)
      .toEqual(valueOrThrow(ExpressionParser.parse("open()")));
    expect(bindings.listeners.map(({ event }) => event))
      .toEqual(["click"]);
  });

  test("reports an invalid class binding expression with its key", () => {
    expect(() => bindingsOf({ "[class.open]": "a(1 2)" }))
      .toThrow(`Expected "," or ")", found "2" (at column 5 in "a(1 2)"), `
        + `in host binding "[class.open]"`);
  });

  test("parses style and attribute bindings, attr mapping to the attribute kind", () => {
    const bindings = bindingsOf({
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
    expect(() => bindingsOf({ "[attr.title]": "a(1 2)" }))
      .toThrow(`in host binding "[attr.title]"`);
  });

  test("rejects handlers other than method() and method($event)", () => {
    for (const handler of ["go", "a.b.c()", "open.toggle"]) {
      expect(() => bindingsOf({ "(click)": handler }))
        .toThrow(
          `Unsupported host handler "${handler}": write a call of a method, as in "method()", "method($event)" or "g.method()"`,
        );
    }
    expect(() => bindingsOf({ "(click)": "open = !open" }))
      .toThrow(`Unsupported host handler "open = !open": `);
  });

  test("reports every invalid entry at once", () => {
    let thrown: unknown;
    try {
      bindingsOf({ "[title]": "x()", "(click)": "go()", "(keyup)": "a.b.c()" });
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
        + `Unsupported host handler "a.b.c()": write a call of a method, as in "method()", "method($event)" or "g.method()"`,
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
    bindingsOf({ "(click)": "toggle()", "(keydown)": "onKey($event)" })
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
    bindingsOf({ "(click)": "toggle()" })
      .attach({ toggle }, element, renderer, view);
    view.destroy();
    element.click();
    expect(toggle).not.toHaveBeenCalled();
  });

  test("throws if the instance has no such method", () => {
    class Toggle {}
    const element = document.createElement("div");
    expect(() =>
      bindingsOf({ "(click)": "toggle()" })
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
    bindingsOf({ "(input)": "select($event.target)" })
      .attach(instance, element, renderer, makeView(element));
    element.dispatchEvent(new Event("input"));
    expect(seen)
      .toEqual([element]);
  });
});

describe("HostBindings handlers on a field", () => {
  test("a listener calls a method of a field of the instance: other.go()", () => {
    const element = document.createElement("button");
    const go = vi.fn();
    const instance = { other: { go } };
    bindingsOf({ "(click)": "other.go()" })
      .attach(instance, element, renderer, makeView(element));
    element.click();
    expect(go)
      .toHaveBeenCalledTimes(1);
  });
});

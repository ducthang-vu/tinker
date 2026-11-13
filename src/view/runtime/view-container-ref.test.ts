import { beforeEach, describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import type { View } from "./view.ts";

@Component({ selector: "tk-item", template: "<span>item</span>" })
class Item {}

let engine: Engine;
let parent: HTMLElement;
let anchor: Comment;

beforeEach(() => {
  engine = Engine.create();
  parent = document.createElement("div");
  anchor = document.createComment("container");
  parent.append(document.createElement("header"), anchor, document.createElement("footer"));
});

/** The parent's children as tags, with the anchor shown as "#anchor" and items numbered. */
function layout(views: View<unknown>[]): string[] {
  return [...parent.childNodes].map((node) => {
    if (node === anchor) return "#anchor";
    const index = views.findIndex((v) => v.host === node);
    return index >= 0 ? `item${index}` : (node as Element).localName;
  });
}

describe("ViewContainerRef", () => {
  test("creates components just before the anchor, in order", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);
    const b = container.createComponent(Item);

    expect(container.length)
      .toBe(2);
    expect(layout([a, b]))
      .toEqual(["header", "item0", "item1", "#anchor", "footer"]);
    expect(a.host.innerHTML)
      .toBe("<span>item</span>");
    expect(engine.getContext(a.host)
      .flatMap((context) => context.componentView)
      .getOrElse(undefined))
      .toBe(a);
  });

  test("inserts at a given index", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);
    const b = container.createComponent(Item);
    const c = container.createComponent(Item, 0);
    const d = container.createComponent(Item, 2);

    expect([0, 1, 2, 3].map((i) => container.get(i)
      .getOrElse(undefined)))
      .toEqual([c, a, d, b]);
    expect(layout([c, a, d, b]))
      .toEqual(["header", "item0", "item1", "item2", "item3", "#anchor", "footer"]);
  });

  test("get and indexOf", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);
    const other = engine.createComponent(Item);

    expect(container.get(0)
      .getOrElse(undefined))
      .toBe(a);
    expect(container.get(5)
      .isNone())
      .toBe(true);
    expect(container.indexOf(a))
      .toBe(0);
    expect(container.indexOf(other))
      .toBe(-1);
  });

  test("moves a view", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);
    const b = container.createComponent(Item);
    const c = container.createComponent(Item);

    container.move(a, 2);
    expect([container.get(0)
      .getOrElse(undefined), container.get(1)
      .getOrElse(undefined), container.get(2)
      .getOrElse(undefined)])
      .toEqual([b, c, a]);
    expect(layout([b, c, a]))
      .toEqual(["header", "item0", "item1", "item2", "#anchor", "footer"]);

    container.move(a, 0);
    expect(layout([a, b, c]))
      .toEqual(["header", "item0", "item1", "item2", "#anchor", "footer"]);
  });

  test("remove destroys a view and takes its host out of the DOM", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);
    const b = container.createComponent(Item);
    const c = container.createComponent(Item);

    container.remove(1);
    expect(b.destroyed)
      .toBe(true);
    expect(b.host.isConnected)
      .toBe(false);
    expect(engine.getContext(b.host)
      .isNone())
      .toBe(true);
    expect(layout([a, c]))
      .toEqual(["header", "item0", "item1", "#anchor", "footer"]);

    container.remove();
    expect(c.destroyed)
      .toBe(true);
    expect(container.length)
      .toBe(1);

    container.remove(7); // nothing there
    expect(container.length)
      .toBe(1);
  });

  test("a view destroyed directly also leaves the container", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);

    a.destroy();

    expect(container.length)
      .toBe(0);
    expect(layout([]))
      .toEqual(["header", "#anchor", "footer"]);
  });

  test("clear destroys every view, last first", () => {
    const container = engine.createViewContainer(anchor);
    const order: number[] = [];
    for (let i = 0; i < 3; i++) container.createComponent(Item)
      .addDestroyCallback(() => order.push(i));

    container.clear();

    expect(order)
      .toEqual([2, 1, 0]);
    expect(container.length)
      .toBe(0);
    expect(layout([]))
      .toEqual(["header", "#anchor", "footer"]);
  });

  test("rejects bad indexes", () => {
    const container = engine.createViewContainer(anchor);
    const a = container.createComponent(Item);

    expect(() => container.createComponent(Item, 2))
      .toThrow(RangeError);
    expect(() => container.createComponent(Item, -1))
      .toThrow("Index -1 is out of range (0 to 1)");
    expect(() => container.createComponent(Item, 0.5))
      .toThrow(RangeError);
    expect(() => container.move(a, 1))
      .toThrow("Index 1 is out of range (0 to 0)");
    expect(container.length)
      .toBe(1);
  });

  test("move rejects a view that is not in the container", () => {
    const container = engine.createViewContainer(anchor);
    expect(() => container.move(engine.createComponent(Item), 0))
      .toThrow(
        "The view is not in this container",
      );
  });

  test("needs its anchor to be in the DOM", () => {
    const container = engine.createViewContainer(document.createComment("detached"));
    expect(() => container.createComponent(Item))
      .toThrow("The container's anchor is not in the DOM");
  });
});

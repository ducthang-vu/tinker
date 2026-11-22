import { beforeEach, describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { ComponentRef } from "../component-ref.ts";
import { Maybe } from "@tinker/functional";
import { Left, valueOrThrow } from "@tinker/functional/v1";

let tracked = 0;
const order: number[] = [];
@Component({ selector: "tk-tracked", template: "" })
class Tracked {
  readonly id = tracked++;

  onDestroy(): void {
    order.push(this.id);
  }
}

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
function layout(views: ComponentRef<object>[]): string[] {
  return [...parent.childNodes].map((node) => {
    if (node === anchor) return "#anchor";
    const index = views.findIndex((v) => v.host.nativeElement === node);
    return index >= 0 ? `item${index}` : (node as Element).localName;
  });
}

describe("ViewContainerRef", () => {
  test("creates components just before the anchor, in order", () => {
    const container = engine.createViewContainer(anchor);
    const a = valueOrThrow(container.createComponent(Item));
    const b = valueOrThrow(container.createComponent(Item));

    expect(container.length)
      .toBe(2);
    expect(layout([a, b]))
      .toEqual(["header", "item0", "item1", "#anchor", "footer"]);
    expect(a.host.nativeElement.innerHTML)
      .toBe("<span>item</span>");
    expect(Maybe.map(
      Maybe.flatMap(engine.getContext(a.host.nativeElement), (context) => context.componentView),
      (componentView) => componentView.host,
    )
      .getOrElse(undefined))
      .toBe(a.host.nativeElement);
  });

  test("a component that cannot be created fails, and the container keeps its views", () => {
    class NotAComponent {}
    const container = engine.createViewContainer(anchor);
    const before = container.length;
    expect(container.createComponent(NotAComponent))
      .toEqual(Left.of(new Error("NotAComponent is not a component: decorate it with @Component")));
    expect(container.length)
      .toBe(before);
  });

  test("inserts at a given index", () => {
    const container = engine.createViewContainer(anchor);
    const a = valueOrThrow(container.createComponent(Item));
    const b = valueOrThrow(container.createComponent(Item));
    const c = valueOrThrow(container.createComponent(Item, 0));
    const d = valueOrThrow(container.createComponent(Item, 2));

    expect([0, 1, 2, 3].map((i) => container.get(i)
      .getOrElse(undefined)))
      .toEqual([c, a, d, b]);
    expect(layout([c, a, d, b]))
      .toEqual(["header", "item0", "item1", "item2", "item3", "#anchor", "footer"]);
  });

  test("get and indexOf", () => {
    const container = engine.createViewContainer(anchor);
    const a = valueOrThrow(container.createComponent(Item));
    const other = valueOrThrow(engine.createComponent(Item));

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
    const a = valueOrThrow(container.createComponent(Item));
    const b = valueOrThrow(container.createComponent(Item));
    const c = valueOrThrow(container.createComponent(Item));

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
    const a = valueOrThrow(container.createComponent(Item));
    const b = valueOrThrow(container.createComponent(Item));
    const c = valueOrThrow(container.createComponent(Item));

    container.remove(1);
    expect(container.indexOf(b))
      .toBe(-1);
    expect(b.host.nativeElement.isConnected)
      .toBe(false);
    expect(engine.getContext(b.host.nativeElement)
      .isNone())
      .toBe(true);
    expect(layout([a, c]))
      .toEqual(["header", "item0", "item1", "#anchor", "footer"]);

    container.remove();
    expect(container.indexOf(c))
      .toBe(-1);
    expect(container.length)
      .toBe(1);

    container.remove(7); // nothing there
    expect(container.length)
      .toBe(1);
  });

  test("a view destroyed directly also leaves the container", () => {
    const container = engine.createViewContainer(anchor);
    const a = valueOrThrow(container.createComponent(Item));

    a.destroy();

    expect(container.length)
      .toBe(0);
    expect(layout([]))
      .toEqual(["header", "#anchor", "footer"]);
  });

  test("clear destroys every view, last first", () => {
    const container = engine.createViewContainer(anchor);
    order.length = 0;
    for (let i = 0; i < 3; i++) container.createComponent(Tracked);

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
    const a = valueOrThrow(container.createComponent(Item));

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
    expect(() => container.move(valueOrThrow(engine.createComponent(Item)), 0))
      .toThrow(
        "The component is not in this container",
      );
  });

  test("needs its anchor to be in the DOM", () => {
    const container = engine.createViewContainer(document.createComment("detached"));
    expect(() => container.createComponent(Item))
      .toThrow("The container's anchor is not in the DOM");
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { ElementRef } from "../runtime/element-ref.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { query, queryAll } from "../authoring/query.ts";
import { Engine } from "../engine.ts";
import { valueOrThrow } from "@tinker/functional/v1";

afterEach(() => {
  document.body.innerHTML = "";
});

@Directive({ selector: "[item]" })
class Item {}

@Component({
  selector: "tk-list",
  template: "<ul><slot></slot></ul>",
})
class List {
  readonly items = queryAll(Item, { from: "content" });
  readonly firstItem = query.required(Item, { from: "content" });
  readonly elements = queryAll(Item, { from: "content", read: ElementRef });
  readonly own = queryAll(Item);
}

describe("content queries", () => {
  test("from: \"content\" lists the direct children a parent passes in, not nested ones", () => {
    @Component({
      selector: "tk-parent",
      template: `<tk-list><li item></li><div><li item></li></div></tk-list>`,
      imports: [List, Item],
    })
    class Parent {
      readonly list = query.required(List);
      readonly all = queryAll(Item);
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(Parent));
    const list = view.instance.list();
    expect(list.items())
      .toHaveLength(1);
    expect(list.elements()[0]!.nativeElement.tagName)
      .toBe("LI");
    expect(list.own())
      .toHaveLength(0);
    expect(view.instance.all())
      .toHaveLength(2);
  });

  test("query.required throws when the content has no match", () => {
    @Component({
      selector: "tk-empty",
      template: `<tk-list></tk-list>`,
      imports: [List],
    })
    class Empty {
      readonly list = query.required(List);
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(Empty));
    expect(() => view.instance.list()
      .firstItem())
      .toThrow("No Item found, which query.required(Item) needs");
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { ElementRef } from "../runtime/element-ref.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { query, queryAll } from "../authoring/query.ts";
import { Engine } from "../engine.ts";
import { isSome, valueOrThrow } from "@tinker/functional";
import { renderComponent, tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { Outlet } from "../authoring/outlet.ts";

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
  readonly nested = queryAll(Item, { from: "content", descendants: true });
  readonly firstNested = query(Item, { from: "content", descendants: true });
  readonly nestedElements = queryAll(Item, { from: "content", descendants: true, read: ElementRef });
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
    const view = valueOrThrow(renderComponent(Engine.create(), Parent));
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
    const view = valueOrThrow(renderComponent(Engine.create(), Empty));
    expect(() => view.instance.list()
      .firstItem())
      .toThrow("No Item found, which query.required(Item) needs");
  });

  test("descendants: true also lists the matches nested in the content, in document order", async () => {
    @Component({
      selector: "tk-nested",
      template: `<tk-list>
        <li item id="a"></li>
        <div><li item id="b"></li></div>
        @if (shown()) { <li item id="c"></li> }
        @map rows(); let row; track row { <li item [id]="row"></li> }
        <tk-container><li item id="z"></li></tk-container>
      </tk-list>`,
      imports: [List, Item],
    })
    class Nested {
      readonly list = query.required(List);
      readonly shown = signal(true);
      readonly rows = signal(["d", "e"]);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Nested));
    await tick();
    const list = view.instance.list();
    const ids = () => list.nestedElements()
      .map((element) => element.nativeElement.id);
    expect(list.items())
      .toHaveLength(1);
    expect(ids())
      .toEqual(["a", "b", "c", "d", "e", "z"]);
    expect(isSome(list.firstNested()))
      .toBe(true);
    view.instance.shown.set(false);
    view.instance.rows.set(["e", "d"]);
    engine.flush();
    await tick();
    expect(ids())
      .toEqual(["a", "b", "e", "d", "z"]);
    expect(list.nested())
      .toHaveLength(5);
  });

  test("content passed on to a nested component is content of both, and a child's own template of neither", async () => {
    @Component({ selector: "tk-own", template: "<i item></i>", imports: [Item] })
    class Own {}
    @Component({
      selector: "tk-outer",
      template: `<tk-list><tk-list><li item></li></tk-list><tk-own></tk-own></tk-list>`,
      imports: [List, Item, Own],
    })
    class Outer {
      readonly lists = queryAll(List);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Outer));
    await tick();
    const [outer, inner] = view.instance.lists();
    expect(outer!.items())
      .toHaveLength(0);
    expect(outer!.nested())
      .toHaveLength(1);
    expect(inner!.items())
      .toHaveLength(1);
  });

  test("a template declared in the content and rendered there by an outlet is content too", async () => {
    @Component({
      selector: "tk-declared",
      template: `<tk-list><template #row><li item></li></template><tk-container [outlet]="row"></tk-container></tk-list>`,
      imports: [List, Item, Outlet],
    })
    class Declared {
      readonly list = query.required(List);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Declared));
    await tick();
    expect(view.instance.list()
      .nested())
      .toHaveLength(1);
  });
});

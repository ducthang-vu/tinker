import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive, ElementRef, input, queryAll } from "../../index.ts";
import { valueOrThrow } from "@tinker/functional";

@Component({
  selector: "tk-item",
  template: "<span>{{ label() }}</span>",
})
class Item {
  readonly label = input("");
}

@Directive({ selector: "[mark]" })
class Mark {}

@Component({
  selector: "tk-card",
  template: "<tk-item label=\"inside the card\"></tk-item>",
  imports: [Item],
})
class Card {}

describe("queryAll", () => {
  test("lists the child components in the template, in document order", async () => {
    @Component({
      selector: "tk-list",
      template: "<tk-item label=\"one\"></tk-item><tk-item label=\"two\"></tk-item>",
      imports: [Item],
    })
    class List {
      readonly items = queryAll(Item);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(List, { host: el }));
    await tick();
    expect(app.root.instance.items()
      .map((item) => item.label()))
      .toEqual(["one", "two"]);
    app.destroy();
  });

  test("follows the rows of a @map as they are added, moved and removed", async () => {
    @Component({
      selector: "tk-rows",
      template: "@map labels(); let label; track label { <tk-item [label]=\"label\"></tk-item> }",
      imports: [Item],
    })
    class Rows {
      readonly labels = signal(["a", "b"]);
      readonly items = queryAll(Item);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Rows, { host: el }));
    await tick();
    const shown = () => app.root.instance.items()
      .map((item) => item.label());
    expect(shown())
      .toEqual(["a", "b"]);
    app.root.instance.labels.set(["b", "c", "a"]);
    await tick();
    expect(shown())
      .toEqual(["b", "c", "a"]);
    app.root.instance.labels.set(["c"]);
    await tick();
    expect(shown())
      .toEqual(["c"]);
    app.destroy();
  });

  test("includes the items of an @if branch, and drops them when it goes", async () => {
    @Component({
      selector: "tk-branch",
      template: "@if (open()) { <tk-item label=\"shown\"></tk-item> }",
      imports: [Item],
    })
    class Branch {
      readonly open = signal(true);
      readonly items = queryAll(Item);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Branch, { host: el }));
    await tick();
    expect(app.root.instance.items()
      .map((item) => item.label()))
      .toEqual(["shown"]);
    app.root.instance.open.set(false);
    await tick();
    expect(app.root.instance.items())
      .toEqual([]);
    app.destroy();
  });

  test("lists directive instances by their type", async () => {
    @Component({
      selector: "tk-marks",
      template: "<p mark></p><p mark></p>",
      imports: [Mark],
    })
    class Marks {
      readonly marks = queryAll(Mark);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Marks, { host: el }));
    await tick();
    expect(app.root.instance.marks())
      .toHaveLength(2);
    expect(app.root.instance.marks()[0])
      .toBeInstanceOf(Mark);
    app.destroy();
  });

  test("does not list the items inside a child component's own template", async () => {
    @Component({
      selector: "tk-outer",
      template: "<tk-card></tk-card>",
      imports: [Card, Item],
    })
    class Outer {
      readonly items = queryAll(Item);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Outer, { host: el }));
    await tick();
    expect(app.root.instance.items())
      .toEqual([]);
    app.destroy();
  });

  test("with read: ElementRef, it lists the elements the matches sit on, in order", async () => {
    @Component({
      selector: "tk-elements",
      template: "@map labels(); let label; track label { <tk-item [label]=\"label\"></tk-item> }",
      imports: [Item],
    })
    class Elements {
      readonly labels = signal(["a", "b"]);
      readonly elements = queryAll(Item, { read: ElementRef });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Elements, { host: el }));
    await tick();
    const tags = () => app.root.instance.elements()
      .map((ref) => ref.nativeElement.tagName);
    expect(tags())
      .toEqual(["TK-ITEM", "TK-ITEM"]);
    expect(app.root.instance.elements()[0]!.nativeElement)
      .toBe(el.querySelector("tk-item"));
    app.root.instance.labels.set(["b"]);
    await tick();
    expect(app.root.instance.elements()
      .map((ref) => ref.nativeElement.textContent))
      .toEqual(["b"]);
    app.destroy();
  });
});

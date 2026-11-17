import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive, input, viewChildren } from "../../index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

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

describe("viewChildren", () => {
  test("lists the child components in the template, in document order", () => {
    @Component({
      selector: "tk-list",
      template: "<tk-item label=\"one\"></tk-item><tk-item label=\"two\"></tk-item>",
      imports: [Item],
    })
    class List {
      readonly items = viewChildren(Item);
    }
    const el = document.createElement("section");
    const app = bootstrap(List, { host: el });
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
      readonly items = viewChildren(Item);
    }
    const el = document.createElement("section");
    const app = bootstrap(Rows, { host: el });
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
      readonly items = viewChildren(Item);
    }
    const el = document.createElement("section");
    const app = bootstrap(Branch, { host: el });
    expect(app.root.instance.items()
      .map((item) => item.label()))
      .toEqual(["shown"]);
    app.root.instance.open.set(false);
    await tick();
    expect(app.root.instance.items())
      .toEqual([]);
    app.destroy();
  });

  test("lists directive instances by their type", () => {
    @Component({
      selector: "tk-marks",
      template: "<p mark></p><p mark></p>",
      imports: [Mark],
    })
    class Marks {
      readonly marks = viewChildren(Mark);
    }
    const el = document.createElement("section");
    const app = bootstrap(Marks, { host: el });
    expect(app.root.instance.marks())
      .toHaveLength(2);
    expect(app.root.instance.marks()[0])
      .toBeInstanceOf(Mark);
    app.destroy();
  });

  test("does not list the items inside a child component's own template", () => {
    @Component({
      selector: "tk-outer",
      template: "<tk-card></tk-card>",
      imports: [Card, Item],
    })
    class Outer {
      readonly items = viewChildren(Item);
    }
    const el = document.createElement("section");
    const app = bootstrap(Outer, { host: el });
    expect(app.root.instance.items())
      .toEqual([]);
    app.destroy();
  });
});

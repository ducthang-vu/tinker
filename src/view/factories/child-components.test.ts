import { afterEach, describe, expect, test } from "vitest";
import { inject, Injectable } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Component, type ComponentMetadata, Directive } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import type { Class } from "../../utils/types.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The component on `element`, through the engine's context. */
function componentOn<T>(engine: Engine, element: Element): T {
  return engine.getContext(element)
    .flatMap((context) => context.componentView)
    .map((view) => view.component as T)
    .getOrThrow(() => new Error("no component on the element"));
}

describe("components in templates", () => {
  test("render inside the parent's template, each with its own instance", () => {
    @Component({ selector: "tk-item", template: "<span>item</span>" })
    class Item {}
    @Component({
      selector: "tk-list",
      template: "<ul><li><tk-item></tk-item></li><li><tk-item></tk-item></li></ul>",
      imports: [Item],
    })
    class List {}
    const engine = Engine.create();
    const view = engine.createComponent(List);

    expect(view.host.innerHTML)
      .toBe("<ul><li><tk-item><span>item</span></tk-item></li><li><tk-item><span>item</span></tk-item></li></ul>");
    const [first, second] = [...view.host.querySelectorAll("tk-item")];
    expect(componentOn(engine, first!))
      .toBeInstanceOf(Item);
    expect(componentOn(engine, first!))
      .not.toBe(componentOn(engine, second!));
  });

  test("can inject their parent component, its providers, and the directives around them", () => {
    @Injectable()
    class ListStore {}
    @Directive({ selector: "li" })
    class Row {}
    @Directive({ selector: "[selectable]" })
    class Selectable {}
    @Component({ selector: "tk-item", template: "" })
    class Item {
      readonly list = inject(List);
      readonly store = inject(ListStore);
      readonly row = inject(Row);
      readonly selectable = inject(Selectable);
    }
    @Component({
      selector: "tk-list",
      template: "<li><tk-item selectable></tk-item></li>",
      imports: [Item, Row, Selectable],
      providers: [ListStore],
    })
    class List {
      readonly store = inject(ListStore);
    }
    const engine = Engine.create();
    const view = engine.createComponent(List);
    const item = componentOn<Item>(engine, view.host.querySelector("tk-item")!);
    expect(item.list)
      .toBe(view.component);
    expect(item.store)
      .toBe(view.component.store);
    expect(item.row)
      .toBeInstanceOf(Row);
    expect(item.selectable)
      .toBeInstanceOf(Selectable);
  });

  test("a grandchild finds its grandparent through the chain", () => {
    @Component({ selector: "tk-c", template: "" })
    class C {
      readonly a = inject(A);
    }
    @Component({ selector: "tk-b", template: "<tk-c></tk-c>", imports: [C] })
    class B {}
    @Component({ selector: "tk-a", template: "<tk-b></tk-b>", imports: [B] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    expect(componentOn<C>(engine, view.host.querySelector("tk-c")!).a)
      .toBe(view.component);
  });

  test("plain attributes set their inputs before their first render", () => {
    @Component({ selector: "tk-item", template: "<span>{{ label() }}</span>" })
    class Item {
      readonly label = input<string>(); // required: reading it unbound would throw
    }
    @Component({ selector: "tk-list", template: `<tk-item label="Milk"></tk-item>`, imports: [Item] })
    class List {}
    const view = Engine.create()
      .createComponent(List);
    expect(view.host.querySelector("span")!.textContent)
      .toBe("Milk");
  });

  test("are created after their element's directives and before the parent's first render", () => {
    const log: string[] = [];
    @Directive({ selector: "[marked]" })
    class Marked {
      constructor() {
        log.push("directive");
      }
    }
    @Component({ selector: "tk-item", template: "" })
    class Item {
      constructor() {
        log.push("child");
      }
    }
    @Component({ selector: "tk-list", template: "<tk-item marked></tk-item>{{ render() }}", imports: [Item, Marked] })
    class List {
      constructor() {
        log.push("parent");
      }

      render() {
        log.push("parent renders");
        return "";
      }
    }
    Engine.create()
      .createComponent(List);
    expect(log)
      .toEqual(["parent", "directive", "child", "parent renders"]);
  });

  test("are destroyed with the parent's view, before it, effects included", () => {
    const log: string[] = [];
    const count = signal(1);
    @Component({ selector: "tk-item", template: "" })
    class Item {
      constructor() {
        inject(Effects)
          .create(() => void log.push(`effect ${count()}`));
      }

      onDestroy() {
        log.push("item destroyed");
      }
    }
    @Component({ selector: "tk-list", template: "<tk-item></tk-item>", imports: [Item] })
    class List {
      onDestroy() {
        log.push("list destroyed");
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(List);
    const itemHost = view.host.querySelector("tk-item")!;
    engine.flush();
    view.destroy();
    count.set(2);
    engine.flush();
    expect(log)
      .toEqual(["effect 1", "item destroyed", "list destroyed"]);
    expect(engine.getContext(itemHost)
      .isNone())
      .toBe(true);
  });

  test("a child that fails leaves nothing of the parent behind", () => {
    const destroyed: string[] = [];
    @Component({ selector: "tk-ok", template: "" })
    class Ok {
      onDestroy() {
        destroyed.push("ok");
      }
    }
    @Component({ selector: "tk-broken", template: "" })
    class Broken {
      constructor() {
        throw new Error("child failed");
      }
    }
    @Component({ selector: "tk-list", template: "<tk-ok></tk-ok><tk-broken></tk-broken>", imports: [Ok, Broken] })
    class List {
      onDestroy() {
        destroyed.push("list");
      }
    }
    const host = document.createElement("div");
    const engine = Engine.create();
    expect(() => engine.createComponent(List, host))
      .toThrow("child failed");
    expect(host.innerHTML)
      .toBe("");
    expect(destroyed)
      .toEqual(["ok", "list"]);
    expect(engine.getContext(host)
      .isNone())
      .toBe(true);
  });
});

describe("recursion", () => {
  /**
   * Decorate `type` by hand: `imports` cannot name a class declared later
   * (or the class itself), so a cycle can only be built this way for now.
   */
  function decorate(type: Class<object>, options: ComponentMetadata): void {
    Component(options)(type, {} as ClassDecoratorContext<Class<object>>);
  }

  test("a component containing itself is reported", () => {
    class Tree {}
    decorate(Tree, { selector: "tk-tree", template: "<tk-tree></tk-tree>", imports: [Tree] });
    expect(() => Engine.create()
      .createComponent(Tree))
      .toThrow("Tree contains itself: Tree → Tree");
  });

  test("through other components too: the path is named, and nothing is left behind", () => {
    class A {}
    class B {}
    decorate(A, { selector: "tk-a", template: "<p><tk-b></tk-b></p>", imports: [B] });
    decorate(B, { selector: "tk-b", template: "<tk-a></tk-a>", imports: [A] });
    const host = document.createElement("div");
    const engine = Engine.create();
    expect(() => engine.createComponent(A, host))
      .toThrow("A contains itself: A → B → A");
    expect(host.innerHTML)
      .toBe("");
    expect(engine.getContext(host)
      .isNone())
      .toBe(true);
  });

  test("the same component twice side by side is not recursion", () => {
    @Component({ selector: "tk-leaf", template: "" })
    class Leaf {}
    @Component({ selector: "tk-pair", template: "<tk-leaf></tk-leaf><tk-leaf></tk-leaf>", imports: [Leaf] })
    class Pair {}
    expect(Engine.create()
      .createComponent(Pair).host.querySelectorAll("tk-leaf"))
      .toHaveLength(2);
  });
});

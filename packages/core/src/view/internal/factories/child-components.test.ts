import { afterEach, describe, expect, test, vi } from "vitest";
import { tick } from "../test-support.ts";
import { inject, Injectable, provide } from "../../../di/index.ts";
import { DEV_MODE } from "../tokens.ts";
import { signal } from "../../../signals/index.ts";
import { Component, type ComponentMetadata, Directive } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import type { Class } from "../../../utils/types.ts";
import { valueOrThrow, isNone, getOrThrow, map, flatMap } from "@tinker/functional";
import { renderComponent } from "../test-support.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The component on `element`, through the engine's context. */
function componentOn<T>(engine: Engine, element: Element): T {
  return getOrThrow(map(
    flatMap(engine.getContext(element), (context) => context.componentView),
    (view) => view.component as T,
  ), () => new Error("no component on the element"));
}

describe("components in templates", () => {
  test("render inside the parent's template, each with its own instance", async () => {
    @Component({ selector: "tk-item", template: "<span>item</span>" })
    class Item {}
    @Component({
      selector: "tk-list",
      template: "<ul><li><tk-item></tk-item></li><li><tk-item></tk-item></li></ul>",
      imports: [Item],
    })
    class List {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));

    await tick();

    expect(view.host.nativeElement.innerHTML)
      .toBe("<ul><li><tk-item><span>item</span></tk-item></li><li><tk-item><span>item</span></tk-item></li></ul>");
    const [first, second] = [...view.host.nativeElement.querySelectorAll("tk-item")];
    expect(componentOn(engine, first!))
      .toBeInstanceOf(Item);
    expect(componentOn(engine, first!))
      .not.toBe(componentOn(engine, second!));
  });

  test("can inject their parent component, its providers, and the directives around them", async () => {
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
    const view = valueOrThrow(renderComponent(engine, List));
    const item = componentOn<Item>(engine, view.host.nativeElement.querySelector("tk-item")!);
    await tick();
    expect(item.list)
      .toBe(view.instance);
    expect(item.store)
      .toBe(view.instance.store);
    expect(item.row)
      .toBeInstanceOf(Row);
    expect(item.selectable)
      .toBeInstanceOf(Selectable);
  });

  test("a grandchild finds its grandparent through the chain", async () => {
    @Component({ selector: "tk-c", template: "" })
    class C {
      readonly a = inject(A);
    }
    @Component({ selector: "tk-b", template: "<tk-c></tk-c>", imports: [C] })
    class B {}
    @Component({ selector: "tk-a", template: "<tk-b></tk-b>", imports: [B] })
    class A {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    await tick();
    expect(componentOn<C>(engine, view.host.nativeElement.querySelector("tk-c")!).a)
      .toBe(view.instance);
  });

  test("plain attributes set their inputs before their first render", async () => {
    @Component({ selector: "tk-item", template: "<span>{{ label() }}</span>" })
    class Item {
      readonly label = input<string>(); // required: reading it unbound would throw
    }
    @Component({ selector: "tk-list", template: `<tk-item label="Milk"></tk-item>`, imports: [Item] })
    class List {}
    const view = valueOrThrow(renderComponent(Engine.create(), List));
    await tick();
    expect(view.host.nativeElement.querySelector("span")!.textContent)
      .toBe("Milk");
  });

  test("are created after their element's directives and before the parent's first render", async () => {
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
    renderComponent(Engine.create(), List);
    await tick();
    expect(log)
      .toEqual(["parent", "directive", "child", "parent renders"]);
  });

  test("are destroyed with the parent's view, before it, effects included", async () => {
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
    const view = valueOrThrow(renderComponent(engine, List));
    const itemHost = view.host.nativeElement.querySelector("tk-item")!;
    engine.flush();
    view.destroy();
    count.set(2);
    engine.flush();
    await tick();
    expect(log)
      .toEqual(["effect 1", "item destroyed", "list destroyed"]);
    expect(isNone(engine.getContext(itemHost)))
      .toBe(true);
  });

  test("a child that fails is reported; its element is left empty and the parent renders", () => {
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
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const host = document.createElement("div");
    const engine = Engine.create();
    const ref = valueOrThrow(engine.bootstrap(List, host));
    expect(error)
      .toHaveBeenCalledWith(expect.stringContaining("Broken failed to create"));
    expect(host.innerHTML)
      .toBe("<tk-ok></tk-ok><tk-broken></tk-broken>");
    expect(host.querySelector("tk-broken")!.childNodes)
      .toHaveLength(0);
    ref.destroy();
    expect(destroyed)
      .toEqual(["ok", "list"]);
    error.mockRestore();
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

  test("a component containing itself is reported, and its element is left empty", () => {
    class Tree {}
    decorate(Tree, { selector: "tk-tree", template: "<tk-tree></tk-tree>", imports: [Tree] });
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = valueOrThrow(renderComponent(Engine.create(), Tree));
    expect(error)
      .toHaveBeenCalledWith(expect.stringContaining("Tree contains itself: Tree → Tree"));
    expect(view.host.nativeElement.innerHTML)
      .toBe("<tk-tree></tk-tree>");
    error.mockRestore();
  });

  test("through other components too: the path is named, and the cycle's element is empty", () => {
    class A {}
    class B {}
    decorate(A, { selector: "tk-a", template: "<p><tk-b></tk-b></p>", imports: [B] });
    decorate(B, { selector: "tk-b", template: "<tk-a></tk-a>", imports: [A] });
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const host = document.createElement("div");
    valueOrThrow(Engine.create()
      .bootstrap(A, host));
    expect(error)
      .toHaveBeenCalledWith(expect.stringContaining("A contains itself: A → B → A"));
    expect(host.innerHTML)
      .toBe("<p><tk-b><tk-a></tk-a></tk-b></p>");
    error.mockRestore();
  });

  test("the same component twice side by side is not recursion", async () => {
    @Component({ selector: "tk-leaf", template: "" })
    class Leaf {}
    @Component({ selector: "tk-pair", template: "<tk-leaf></tk-leaf><tk-leaf></tk-leaf>", imports: [Leaf] })
    class Pair {}
    await tick();
    expect(valueOrThrow(renderComponent(Engine.create(), Pair)).host.nativeElement.querySelectorAll("tk-leaf"))
      .toHaveLength(2);
  });
});

describe("a failed child in development mode", () => {
  @Component({ selector: "tk-fails", template: "" })
  class Fails {
    constructor() {
      throw new Error("child failed");
    }
  }
  @Component({ selector: "tk-host", template: "<p><tk-fails></tk-fails></p>", imports: [Fails] })
  class Host {}

  test("its element keeps a comment naming the failed selector", () => {
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const engine = Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] });
    const view = valueOrThrow(renderComponent(engine, Host));
    expect(view.host.nativeElement.innerHTML)
      .toBe("<p><tk-fails><!--tk-fails failed to create--></tk-fails></p>");
    error.mockRestore();
  });

  test("outside development mode the element is left empty, with no comment", () => {
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = valueOrThrow(renderComponent(Engine.create(), Host));
    expect(view.host.nativeElement.innerHTML)
      .toBe("<p><tk-fails></tk-fails></p>");
    error.mockRestore();
  });
});

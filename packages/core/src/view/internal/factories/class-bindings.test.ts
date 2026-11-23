import { afterEach, describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { inject } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { valueOrThrow, getOrThrow, map, flatMap } from "@tinker/functional";
import { renderComponent } from "../test-support.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("class bindings in templates", () => {
  test("follow the component's signals, and leave plain classes alone", async () => {
    @Component({
      selector: "tk-todo",
      template: `<p class="todo" [class.done]="done()" [class.urgent]="urgent">Milk</p>`,
    })
    class Todo {
      readonly done = signal(false);
      readonly urgent = true; // a plain field: read once
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Todo));
    const p = view.host.nativeElement.querySelector("p")!;
    await tick();
    expect(p.className)
      .toBe("todo urgent");
    view.instance.done.set(true);
    engine.flush();
    expect(p.className)
      .toBe("todo urgent done");
    view.instance.done.set(false);
    engine.flush();
    expect(p.className)
      .toBe("todo urgent");
  });

  test("class names keep their case, as written", async () => {
    @Component({ selector: "tk-a", template: `<p [class.isOpen]="open">x</p>` })
    class A {
      readonly open = true;
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    engine.flush();
    expect(view.host.nativeElement.querySelector("p")!.className)
      .toBe("isOpen");
  });

  test("on a child component's element, they are evaluated against the parent", async () => {
    @Component({ selector: "tk-item", template: "item" })
    class Item {}
    @Component({
      selector: "tk-list",
      template: `<tk-item [class.selected]="selected()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly selected = signal(false);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    view.instance.selected.set(true);
    engine.flush();
    await tick();
    expect(view.host.nativeElement.querySelector("tk-item")!.className)
      .toBe("selected");
  });
});

describe("host class bindings", () => {
  test("a directive's follow its own signals, keeping their case", async () => {
    @Directive({
      selector: "[toggle]",
      host: { "[class.isOn]": "on()", "(click)": "flip()" },
    })
    class Toggle {
      readonly on = signal(false);
      flip() {
        this.on.update((on) => !on);
      }
    }
    @Component({ selector: "tk-a", template: `<button toggle>x</button>`, imports: [Toggle] })
    class A {}
    const engine = Engine.create();
    const button = valueOrThrow(renderComponent(engine, A)).host.nativeElement.querySelector("button")!;
    await tick();
    expect(button.className)
      .toBe("");
    button.click();
    engine.flush();
    expect(button.className)
      .toBe("isOn");
    button.click();
    engine.flush();
    expect(button.className)
      .toBe("");
  });

  test("a component's own, and its host directives', are set from its first render", async () => {
    @Directive({ selector: "[focusable]", host: { "[class.focusable]": "enabled" } })
    class Focusable {
      readonly enabled = true;
    }
    @Component({
      selector: "tk-menu",
      template: "",
      host: { "[class.open]": "open()" },
      hostDirectives: [Focusable],
    })
    class Menu {
      readonly open = signal(true);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Menu));
    await tick();
    expect(view.host.nativeElement.className)
      .toBe("focusable open");
    view.instance.open.set(false);
    engine.flush();
    expect(view.host.nativeElement.className)
      .toBe("focusable");
  });

  test("an invalid expression is reported when the component is created", () => {
    @Directive({ selector: "[bad]", host: { "[class.on]": "a(1 2)" } })
    class Bad {}
    @Component({ selector: "tk-a", template: `<p bad></p>`, imports: [Bad] })
    class A {}
    expect(() => valueOrThrow(renderComponent(Engine.create(), A)))
      .toThrow(`in host binding "[class.on]"`);
  });
});

describe("a child component's host class bindings", () => {
  test("are updated by the parent's view, not the child's", async () => {
    let childRenders = 0;
    @Component({ selector: "tk-item", template: "{{ render() }}", host: { "[class.active]": "active()" } })
    class Item {
      readonly active = signal(false);
      render() {
        childRenders++;
        return "item";
      }
    }
    @Component({ selector: "tk-list", template: "<tk-item></tk-item>", imports: [Item] })
    class List {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const host = view.host.nativeElement.querySelector("tk-item")!;
    const item = getOrThrow(map(
      flatMap(engine.getContext(host), (context) => context.componentView),
      (child) => child.component as Item,
    ), () => new Error("no item"));
    await tick();
    expect(childRenders)
      .toBe(1);

    item.active.set(true);
    engine.flush();

    expect(host.className)
      .toBe("active");
    expect(childRenders) // the child's own template did not re-render for its host binding
      .toBe(1);
  });

  test("the parent's template binding on that element takes precedence, for the same class", async () => {
    @Component({
      selector: "tk-item",
      template: "",
      host: { "[class.selected]": "selected()", "[class.item]": "always" },
    })
    class Item {
      readonly selected = signal(true);
      readonly always = true;
    }
    @Component({
      selector: "tk-list",
      template: `<tk-item [class.selected]="selected()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly selected = signal(false);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const host = view.host.nativeElement.querySelector("tk-item")!;
    await tick();
    expect(host.className) // the child says selected, the parent says not: the parent wins
      .toBe("item");
    view.instance.selected.set(true);
    engine.flush();
    expect(host.className)
      .toBe("item selected");
  });

  test("the same precedence over a directive's host binding on that element", async () => {
    @Directive({ selector: "[marker]", host: { "[class.on]": "on" } })
    class Marker {
      readonly on = true;
    }
    @Component({
      selector: "tk-a",
      template: `<p marker [class.on]="off"></p>`,
      imports: [Marker],
    })
    class A {
      readonly off = false;
    }
    await tick();
    expect(valueOrThrow(renderComponent(Engine.create(), A)).host.nativeElement.querySelector("p")!.className)
      .toBe("");
  });

  test("its host directives' bindings move to the parent's view too", async () => {
    @Directive({ selector: "[pressable]", host: { "[class.pressed]": "pressed()" } })
    class Pressable {
      readonly pressed = signal(false);
    }
    @Component({ selector: "tk-button", template: "ok", hostDirectives: [Pressable] })
    class Button {
      readonly pressable = inject(Pressable);
    }
    @Component({ selector: "tk-bar", template: "<tk-button></tk-button>", imports: [Button] })
    class Bar {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Bar));
    const host = view.host.nativeElement.querySelector("tk-button")!;
    map(
      flatMap(engine.getContext(host), (context) => context.componentView),
      (child) => (child.component as Button).pressable.pressed.set(true),
    );
    engine.flush();
    await tick();
    expect(host.className)
      .toBe("pressed");
  });
});

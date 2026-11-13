import { afterEach, describe, expect, test } from "vitest";
import { signal } from "../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("class bindings in templates", () => {
  test("follow the component's signals, and leave plain classes alone", () => {
    @Component({
      selector: "tk-todo",
      template: `<p class="todo" [class.done]="done()" [class.urgent]="urgent">Milk</p>`,
    })
    class Todo {
      readonly done = signal(false);
      readonly urgent = true; // a plain field: read once
    }
    const engine = Engine.create();
    const view = engine.createComponent(Todo);
    const p = view.host.querySelector("p")!;
    expect(p.className)
      .toBe("todo urgent");
    view.component.done.set(true);
    engine.flush();
    expect(p.className)
      .toBe("todo urgent done");
    view.component.done.set(false);
    engine.flush();
    expect(p.className)
      .toBe("todo urgent");
  });

  test("class names are lowercased by the browser's parser", () => {
    @Component({ selector: "tk-a", template: `<p [class.isOpen]="open">x</p>` })
    class A {
      readonly open = true;
    }
    expect(Engine.create()
      .createComponent(A).host.querySelector("p")!.className)
      .toBe("isopen");
  });

  test("on a child component's element, they are evaluated against the parent", () => {
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
    const view = engine.createComponent(List);
    view.component.selected.set(true);
    engine.flush();
    expect(view.host.querySelector("tk-item")!.className)
      .toBe("selected");
  });
});

describe("host class bindings", () => {
  test("a directive's follow its own signals, keeping their case", () => {
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
    const button = engine.createComponent(A).host.querySelector("button")!;
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

  test("a component's own, and its host directives', are set from its first render", () => {
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
    const view = engine.createComponent(Menu);
    expect(view.host.className)
      .toBe("focusable open");
    view.component.open.set(false);
    engine.flush();
    expect(view.host.className)
      .toBe("focusable");
  });

  test("an invalid expression is reported when the directive is used", () => {
    @Directive({ selector: "[bad]", host: { "[class.on]": "a + b" } })
    class Bad {}
    @Component({ selector: "tk-a", template: `<p bad></p>`, imports: [Bad] })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow(`in host binding "[class.on]"`);
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { computed, signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The instances on `element`: its directives, then its component if any. */
function instancesOn(engine: Engine, element: Element): object[] {
  return engine.getContext(element)
    .map((context) => [
      ...context.directives,
      ...context.componentView.map((view) => [view.component as object])
        .getOrElse([]),
    ])
    .getOrElse([]);
}

describe("input bindings", () => {
  test("set a child component's input from the parent, and keep it up to date", () => {
    @Component({ selector: "tk-item", template: "<span>{{ label() }}</span>" })
    class Item {
      readonly label = input<string>(); // required: bound before the first render
    }
    @Component({ selector: "tk-list", template: `<tk-item [label]="name()"></tk-item>`, imports: [Item] })
    class List {
      readonly name = signal("Milk");
    }
    const engine = Engine.create();
    const view = engine.createComponent(List);
    const span = view.host.nativeElement.querySelector("span")!;
    expect(span.textContent)
      .toBe("Milk");

    view.instance.name.set("Bread");
    engine.flush();

    expect(span.textContent)
      .toBe("Bread");
  });

  test("set a directive's input; what derives from it follows", () => {
    @Directive({ selector: "[tooltip]" })
    class Tooltip {
      readonly text = input("");
      readonly shout = computed(() => this.text()
        .toUpperCase());
    }
    @Component({ selector: "tk-a", template: `<button tooltip [text]="hint()">x</button>`, imports: [Tooltip] })
    class A {
      readonly hint = signal("save");
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [tooltip] = instancesOn(engine, view.host.nativeElement.querySelector("button")!) as [Tooltip];
    expect(tooltip.shout())
      .toBe("SAVE");
    view.instance.hint.set("undo");
    engine.flush();
    expect(tooltip.shout())
      .toBe("UNDO");
  });

  test("set every input of that name on the element: directives and component", () => {
    @Directive({ selector: "[labelled]" })
    class Labelled {
      readonly label = input("");
    }
    @Component({ selector: "tk-item", template: "" })
    class Item {
      readonly label = input("");
    }
    @Component({
      selector: "tk-list",
      template: `<tk-item labelled [label]="name"></tk-item>`,
      imports: [Item, Labelled],
    })
    class List {
      readonly name = "Milk";
    }
    const engine = Engine.create();
    const view = engine.createComponent(List);
    const [labelled, item] = instancesOn(engine, view.host.nativeElement.querySelector("tk-item")!) as [Labelled, Item];
    expect([labelled.label(), item.label()])
      .toEqual(["Milk", "Milk"]);
  });

  test("match input names case-insensitively, and override a plain attribute of that name", () => {
    @Component({ selector: "tk-box", template: "{{ maxWidth() }}" })
    class Box {
      readonly maxWidth = input("auto");
    }
    @Component({
      selector: "tk-a",
      template: `<tk-box maxWidth="10" [maxWidth]="width"></tk-box>`,
      imports: [Box],
    })
    class A {
      readonly width = "200";
    }
    expect(Engine.create()
      .createComponent(A).host.nativeElement.querySelector("tk-box")!.textContent)
      .toBe("200");
  });

  test("set the input only when the value changed: the child does not re-render needlessly", () => {
    let childRenders = 0;
    @Component({ selector: "tk-item", template: "{{ render() }}" })
    class Item {
      readonly label = input("");
      render() {
        childRenders++;
        return this.label();
      }
    }
    @Component({
      selector: "tk-list",
      template: `<p>{{ count() }}</p><tk-item [label]="name()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly count = signal(0);
      readonly name = signal("Milk");
    }
    const engine = Engine.create();
    const view = engine.createComponent(List);
    expect(childRenders)
      .toBe(1);
    view.instance.count.set(1); // the parent re-renders; the bound value stays "Milk"
    engine.flush();
    expect(childRenders)
      .toBe(1);
  });

  test("an input no directive or component on the element has is an error, and leaves nothing behind", () => {
    @Component({ selector: "tk-item", template: "" })
    class Item {}
    @Component({ selector: "tk-list", template: `<tk-item [label]="name"></tk-item>`, imports: [Item] })
    class List {
      readonly name = "Milk";
    }
    const host = document.createElement("div");
    const engine = Engine.create();
    expect(() => engine.createComponent(List, host))
      .toThrow(`[label] on <tk-item>: no directive or component on this element has an input "label"`);
    expect(host.innerHTML)
      .toBe("");
    expect(engine.getContext(host)
      .isNone())
      .toBe(true);
  });

  test("an invalid expression is reported where it is written", () => {
    @Component({ selector: "tk-item", template: "" })
    class Item {
      readonly label = input("");
    }
    @Component({ selector: "tk-list", template: `<tk-item [label]="a + b"></tk-item>`, imports: [Item] })
    class List {}
    expect(() => Engine.create()
      .createComponent(List))
      .toThrow(`in [label] on <tk-item>`);
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { tick } from "../test-support.ts";
import { computed, signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import { valueOrThrow, isNone, getOrElse, map, match } from "@tinker/functional";
import { renderComponent } from "../test-support.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The instances on `element`: its directives, then its component if any. */
function instancesOn(engine: Engine, element: Element): object[] {
  return getOrElse(map(engine.getContext(element), (context) => [
    ...context.directives,
    ...getOrElse(map(context.componentView, (view) => [view.component as object]), []),
  ]), []);
}

describe("input bindings", () => {
  test("set a child component's input from the parent, and keep it up to date", async () => {
    @Component({ selector: "tk-item", template: "<span>{{ label() }}</span>" })
    class Item {
      readonly label = input<string>(); // required: bound before the first render
    }
    @Component({ selector: "tk-list", template: `<tk-item [label]="name()"></tk-item>`, imports: [Item] })
    class List {
      readonly name = signal("Milk");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const span = view.host.nativeElement.querySelector("span")!;
    await tick();
    expect(span.textContent)
      .toBe("Milk");

    view.instance.name.set("Bread");
    engine.flush();

    expect(span.textContent)
      .toBe("Bread");
  });

  test("set a directive's input; what derives from it follows", async () => {
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
    const view = valueOrThrow(renderComponent(engine, A));
    const [tooltip] = instancesOn(engine, view.host.nativeElement.querySelector("button")!) as [Tooltip];
    await tick();
    expect(tooltip.shout())
      .toBe("SAVE");
    view.instance.hint.set("undo");
    engine.flush();
    expect(tooltip.shout())
      .toBe("UNDO");
  });

  test("an unqualified input that two instances on the element have is an error, and a qualified one sets one", () => {
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
    const error = vi.spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = valueOrThrow(renderComponent(Engine.create(), List));
    expect(error)
      .toHaveBeenCalledWith(expect.stringContaining(
        "[label] on <tk-item> would reach labelled and tk-item: write [labelled.label] to choose one",
      ));
    expect(view.host.nativeElement.innerHTML)
      .toBe("<tk-item labelled=\"\"></tk-item>");
    error.mockRestore();
  });

  test("[owner.input] sets the input of the directive or component with that selector", async () => {
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
      template: `<tk-item labelled [labelled.label]="name" [tk-item.label]="other"></tk-item>`,
      imports: [Item, Labelled],
    })
    class List {
      readonly name = "Milk";
      readonly other = "Bread";
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const [labelled, item] = instancesOn(engine, view.host.nativeElement.querySelector("tk-item")!) as [Labelled, Item];
    await tick();
    expect([labelled.label(), item.label()])
      .toEqual(["Milk", "Bread"]);
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
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    engine.flush();
    expect(view.host.nativeElement.querySelector("tk-box")!.textContent)
      .toBe("200");
  });

  test("set the input only when the value changed: the child does not re-render needlessly", async () => {
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
    const view = valueOrThrow(renderComponent(engine, List));
    await tick();
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
    expect(() => valueOrThrow(engine.bootstrap(List, host)))
      .toThrow(`[label] on <tk-item>: no directive or component on this element has an input "label"`);
    expect(host.innerHTML)
      .toBe("");
    expect(isNone(engine.getContext(host)))
      .toBe(true);
  });

  test("an invalid expression is reported where it is written", () => {
    @Component({ selector: "tk-item", template: "" })
    class Item {
      readonly label = input("");
    }
    @Component({ selector: "tk-list", template: `<tk-item [label]="a(1 2)"></tk-item>`, imports: [Item] })
    class List {}
    expect(() => valueOrThrow(renderComponent(Engine.create(), List)))
      .toThrow(`in [label] on <tk-item>`);
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { valueOrThrow, getOrElse, map } from "@tinker/functional";
import { renderComponent } from "../test-support.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("style and attribute bindings in templates", () => {
  test("[style.x] and [attr.x] follow the component's signals, on a plain element", async () => {
    @Component({
      selector: "tk-a",
      template: `<p [style.color]="color()" [attr.title]="title()">x</p>`,
    })
    class A {
      readonly color = signal("red");
      readonly title = signal<string | undefined>("first");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    const p = view.host.nativeElement.querySelector("p")!;
    await tick();
    expect([p.style.color, p.getAttribute("title")])
      .toEqual(["red", "first"]);
    view.instance.color.set("blue");
    view.instance.title.set(undefined);
    engine.flush();
    expect([p.style.color, p.hasAttribute("title")])
      .toEqual(["blue", false]);
  });

  test("[style.x] on a component's element is the parent's, like a class binding", async () => {
    @Component({ selector: "tk-item", template: "" })
    class Item {}
    @Component({
      selector: "tk-list",
      template: `<tk-item [style.opacity]="opacity()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly opacity = signal("0.5");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const item = view.host.nativeElement.querySelector("tk-item") as HTMLElement;
    await tick();
    expect(item.style.opacity)
      .toBe("0.5");
    view.instance.opacity.set("1");
    engine.flush();
    expect(item.style.opacity)
      .toBe("1");
  });
});

describe("style and attribute bindings in host bindings", () => {
  test("a directive's host style and attribute follow its own signals", async () => {
    @Directive({
      selector: "[fade]",
      host: { "[style.opacity]": "opacity()", "[attr.role]": "role()" },
    })
    class Fade {
      readonly opacity = signal("0.25");
      readonly role = signal<string | undefined>("status");
    }
    @Component({ selector: "tk-a", template: "<p fade>x</p>", imports: [Fade] })
    class A {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    const p = view.host.nativeElement.querySelector("p")!;
    await tick();
    expect([p.style.opacity, p.getAttribute("role")])
      .toEqual(["0.25", "status"]);
    const [fade] = getOrElse(
      map(engine.getContext(p), (context) => context.directives),
      [],
    ) as [Fade];
    fade!.opacity.set("1");
    fade!.role.set(undefined);
    engine.flush();
    expect([p.style.opacity, p.hasAttribute("role")])
      .toEqual(["1", false]);
  });
});

describe("precedence: a template binding on the element wins over a host binding", () => {
  test("for the same attribute and style, the parent's template decides; the child's host binding is ignored", async () => {
    @Component({
      selector: "tk-item",
      template: "",
      host: { "[attr.title]": "fromChild()", "[style.color]": "fromChild()" },
    })
    class Item {
      readonly fromChild = signal("child");
    }
    @Component({
      selector: "tk-list",
      template: `<tk-item [attr.title]="fromParent()" [style.color]="color()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly fromParent = signal("parent");
      readonly color = signal("green");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const item = view.host.nativeElement.querySelector("tk-item") as HTMLElement;
    await tick();
    expect([item.getAttribute("title"), item.style.color])
      .toEqual(["parent", "green"]);
  });

  test("a host binding for another name is kept", async () => {
    @Component({
      selector: "tk-item",
      template: "",
      host: { "[attr.role]": "role()" },
    })
    class Item {
      readonly role = signal("listitem");
    }
    @Component({
      selector: "tk-list",
      template: `<tk-item [attr.title]="title()"></tk-item>`,
      imports: [Item],
    })
    class List {
      readonly title = signal("t");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, List));
    const item = view.host.nativeElement.querySelector("tk-item")!;
    await tick();
    expect([item.getAttribute("title"), item.getAttribute("role")])
      .toEqual(["t", "listitem"]);
  });
});

describe("null and undefined attribute values render nothing", () => {
  test("a host [attr.x] bound to null or undefined sets no attribute, and removes one that was set", () => {
    @Directive({
      selector: "[toggle]",
      host: { "[attr.disabled]": "disabled()" },
    })
    class Toggle {
      readonly disabled = signal<string | null | undefined>(undefined);
    }
    @Component({ selector: "tk-a", template: "<button toggle>x</button>", imports: [Toggle] })
    class A {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, A));
    const button = view.host.nativeElement.querySelector("button")!;
    engine.flush();
    expect(button.hasAttribute("disabled"))
      .toBe(false);
    expect(
      button.outerHTML,
    )
      .toBe(`<button toggle="">x</button>`);

    const [toggle] = getOrElse(
      map(engine.getContext(button), (context) => context.directives),
      [],
    ) as [Toggle];
    toggle!.disabled.set("");
    engine.flush();
    expect(button.hasAttribute("disabled"))
      .toBe(true);

    toggle!.disabled.set(null);
    engine.flush();
    expect(button.hasAttribute("disabled"))
      .toBe(false);
  });

  test("a template [attr.x] bound to null or undefined sets no attribute", () => {
    @Component({
      selector: "tk-b",
      template: `<button [attr.disabled]="value()">x</button>`,
    })
    class B {
      readonly value = signal<string | null | undefined>(undefined);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, B));
    engine.flush();
    expect(view.host.nativeElement.querySelector("button")!.outerHTML)
      .toBe("<button>x</button>");
  });
});

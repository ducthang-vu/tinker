import { afterEach, describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import { booleanAdapter, numberAdapter } from "../authoring/input-adapters.ts";
import { input, InputNotBoundError } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import { signal } from "../../../signals/index.ts";
import { valueOrThrow, getOrThrow } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The component instance on `element`, which a parent's template created. */
function componentOn(engine: Engine, element: Element): object {
  return getOrThrow(getOrThrow(engine.getContext(element), () => new Error("no context on the element"))
    .componentView, () => new Error("no component on the element"))
    .component as object;
}

@Component({
  selector: "tk-item",
  template: "<i>{{ label() }}</i>",
})
class Item {
  readonly size = input(0, { adapter: numberAdapter });
  readonly label = input("", { name: "title" });
  readonly open = input(false, { adapter: booleanAdapter });
  readonly tags = input<string[]>([], { adapter: (value) => value.split(",") });
}

describe("input options: the adapter reads a plain attribute", () => {
  test("each attribute is read by its input's adapter, and its name is the option's name", () => {
    @Component({
      selector: "tk-parent",
      template: `<tk-item size="3" title="hi" open tags="a,b"></tk-item>`,
      imports: [Item],
    })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const item = componentOn(engine, view.host.nativeElement.querySelector("tk-item")!) as Item;
    expect(item.size())
      .toBe(3);
    expect(item.label())
      .toBe("hi");
    expect(item.open())
      .toBe(true);
    expect(item.tags())
      .toEqual(["a", "b"]);
  });

  test("the property's name is not a template name when the option gives another", () => {
    @Component({
      selector: "tk-parent",
      template: `<tk-item label="ignored" title="shown"></tk-item>`,
      imports: [Item],
    })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const item = componentOn(engine, view.host.nativeElement.querySelector("tk-item")!) as Item;
    expect(item.label())
      .toBe("shown");
  });

  test("a boolean adapter reads a bare attribute as true, \"false\" as false, and no attribute as the default", () => {
    @Component({
      selector: "tk-parent",
      template: `<tk-item open="false"></tk-item><tk-item></tk-item>`,
      imports: [Item],
    })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const [first, second] = Array.from(view.host.nativeElement.querySelectorAll("tk-item"));
    expect((componentOn(engine, first!) as Item).open())
      .toBe(false);
    expect((componentOn(engine, second!) as Item).open())
      .toBe(false);
  });
});

describe("input options: template bindings are already typed", () => {
  test("[name] sets the input as the expression gives it, without the adapter", () => {
    @Component({
      selector: "tk-parent",
      template: `<tk-item [size]="n()"></tk-item>`,
      imports: [Item],
    })
    class Parent {
      readonly n = signal(7);
    }
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const item = componentOn(engine, view.host.nativeElement.querySelector("tk-item")!) as Item;
    expect(item.size())
      .toBe(7);
  });
});

describe("input options: how input() reads its arguments", () => {
  test("a single options object with only a name is options, not a default", () => {
    @Component({ selector: "tk-named", template: "" })
    class Named {
      readonly label = input<string>({ name: "title" });
    }
    @Component({ selector: "tk-parent", template: `<tk-named title="x"></tk-named>`, imports: [Named] })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const named = componentOn(engine, view.host.nativeElement.querySelector("tk-named")!) as Named;
    expect(named.label())
      .toBe("x");
  });

  test("a null default is a default value", () => {
    @Component({ selector: "tk-nullable", template: "" })
    class Nullable {
      readonly value = input<string | null>(null);
    }
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Nullable));
    expect(view.instance.value())
      .toBeNull();
  });
});

describe("input options: a required input with an adapter", () => {
  test("throws when read before a plain attribute or a binding sets it", () => {
    @Component({ selector: "tk-required", template: "" })
    class Required {
      readonly count = input({ adapter: numberAdapter });
    }
    @Component({ selector: "tk-parent", template: "<tk-required></tk-required>", imports: [Required] })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const required = componentOn(engine, view.host.nativeElement.querySelector("tk-required")!) as Required;
    expect(() => required.count())
      .toThrow(InputNotBoundError);
  });
});

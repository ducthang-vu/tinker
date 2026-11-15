import { describe, expect, test } from "vitest";
import { signal } from "../../signals/index.ts";
import { Component, Directive } from "./decorators.ts";
import { InputNotBoundError, inputsOf } from "./input.ts";
import { model } from "./model.ts";
import { outputsOf } from "./output.ts";
import { Engine } from "../engine.ts";

/** Subscribe to the `valueChange` output of `owner`, recording the values. */
function hear(owner: object): unknown[] {
  const heard: unknown[] = [];
  outputsOf(owner)
    .get("valueChange")!.stream.run({ next: (v) => heard.push(v) });
  return heard;
}

describe("model", () => {
  test("is readable, and the owner's set and update change it", () => {
    class Item {
      readonly value = model("a");
    }
    const item = new Item();
    expect(item.value())
      .toBe("a");
    item.value.set("b");
    item.value.update((v) => `${v}!`);
    expect(item.value())
      .toBe("b!");
    expect(item.value.asReadonly()())
      .toBe("b!");
  });

  test("set emits valueChange, and only when the value changed", () => {
    class Item {
      readonly value = model("a");
    }
    const item = new Item();
    const heard = hear(item);
    item.value.set("a"); // unchanged: nothing
    item.value.set("b");
    item.value.set("b"); // unchanged again
    item.value.update((v) => `${v}!`);
    expect(heard)
      .toEqual(["b", "b!"]);
  });

  test("a value bound through the input changes the model without emitting", () => {
    class Item {
      readonly value = model("a");
    }
    const item = new Item();
    const heard = hear(item);
    const [binding] = [...inputsOf(item)
      .values()];
    binding!.bind("from the parent");
    expect(item.value())
      .toBe("from the parent");
    expect(heard)
      .toEqual([]);
  });

  test("is an input and an output of the owner: named value, and valueChange", () => {
    class Item {
      readonly value = model<string>();
    }
    const item = new Item();
    expect([...inputsOf(item)
      .keys()])
      .toEqual(["value"]);
    expect([...outputsOf(item)
      .keys()])
      .toEqual(["valueChange"]);
  });

  test("required: reading it before it is bound throws; set before that binds it", () => {
    class Item {
      readonly value = model<string>();
    }
    const item = new Item();
    expect(() => item.value())
      .toThrow(InputNotBoundError);
    item.value.set("now bound");
    expect(item.value())
      .toBe("now bound");
  });

  test("undefined is a valid default, and an update uses the current value", () => {
    class Item {
      readonly value = model<number | undefined>(undefined);
    }
    const item = new Item();
    expect(item.value())
      .toBeUndefined();
    item.value.update((v) => (v ?? 0) + 1);
    expect(item.value())
      .toBe(1);
  });
});

describe("two-way binding in templates", () => {
  /** A child with a model, and a parent that binds it and can react to it. */
  function setup(onChange: (value: string) => void = () => {}) {
    @Component({ selector: "tk-item", template: "<span>{{ value() }}</span>" })
    class Item {
      readonly value = model("");
    }
    @Component({
      selector: "tk-form",
      template: `<tk-item [value]="name()" (valueChange)="changed($event)"></tk-item>`,
      imports: [Item],
    })
    class Form {
      readonly name = signal("a");
      changed(value: string) {
        onChange(value);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(Form);
    const itemHost = view.host.querySelector("tk-item")!;
    const item = engine.getContext(itemHost)
      .flatMap((context) => context.componentView)
      .map((child) => child.component as Item)
      .getOrThrow(() => new Error("no item"));
    return { engine, form: view, item, span: itemHost.querySelector("span")! };
  }

  test("the owner's change reaches the parent's handler, once", () => {
    const changes: string[] = [];
    const { item } = setup((value) => changes.push(value));
    item.value.set("b");
    expect(changes)
      .toEqual(["b"]);
  });

  test("the parent's change reaches the child's model, and does not echo back to the parent's handler", () => {
    const changes: string[] = [];
    const { engine, form, item, span } = setup((value) => changes.push(value));
    form.component.name.set("from the parent");
    engine.flush();
    expect(item.value())
      .toBe("from the parent");
    expect(span.textContent)
      .toBe("from the parent");
    expect(changes)
      .toEqual([]);
  });

  test("a handler that writes the parent's state closes the loop once: equal values stop it", () => {
    const changes: string[] = [];
    const { engine, form, item } = setup((value) => {
      changes.push(value);
      form.component.name.set(value);
    });
    item.value.set("b");
    engine.flush();
    expect(item.value())
      .toBe("b");
    expect(changes)
      .toEqual(["b"]);
  });

  test("a directive's model works the same way, on its element", () => {
    @Directive({ selector: "[pick]" })
    class Pick {
      readonly value = model("");
      choose(value: string) {
        this.value.set(value);
      }
    }
    const changes: string[] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick [value]="name()" (valueChange)="changed($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      readonly name = signal("first");
      changed(value: string) {
        changes.push(value);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [pick] = engine.getContext(view.host.querySelector("button")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Pick];
    expect(pick!.value())
      .toBe("first");
    pick!.choose("second");
    expect(changes)
      .toEqual(["second"]);
    view.component.name.set("third");
    engine.flush();
    expect(pick!.value())
      .toBe("third");
    expect(changes)
      .toEqual(["second"]);
  });
});

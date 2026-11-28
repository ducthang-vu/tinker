import { afterEach, describe, expect, test } from "vitest";
import { computed, signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { input } from "../authoring/input.ts";
import { model } from "../authoring/model.ts";
import { query } from "../authoring/query.ts";
import { Engine } from "../engine.ts";
import { messageOf, renderComponent, tick } from "../test-support.ts";
import { valueOrThrow } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("two-way bindings", () => {
  test("[(value)] sets the property from the signal, and the signal after each input event", async () => {
    @Component({ selector: "tk-name", template: `<input [(value)]="name"><p>{{ name() }}</p>` })
    class Name {
      readonly name = signal("Ada");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Name));
    await tick();
    const input = view.host.nativeElement.querySelector("input")!;
    expect(input.value)
      .toBe("Ada");
    input.value = "Grace";
    input.dispatchEvent(new Event("input"));
    expect(view.instance.name())
      .toBe("Grace");
    view.instance.name.set("Linus");
    engine.flush();
    await tick();
    expect(input.value)
      .toBe("Linus");
  });

  test("[(checked)] follows the change event, and reads the property's name in any case", async () => {
    @Component({
      selector: "tk-done",
      template: `@map rows(); let row { <input type="checkbox" [(CHECKED)]="row.done"> }`,
    })
    class Done {
      readonly rows = signal([{ done: signal(false) }]);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Done));
    await tick();
    const box = view.host.nativeElement.querySelector("input")!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(view.instance.rows()[0]!.done())
      .toBe(true);
  });

  test("on a component, [(value)] binds its model: the model's changes write the signal", async () => {
    @Component({ selector: "tk-field", template: `<p>{{ value() }}</p>` })
    class Field {
      readonly value = model("");
    }
    @Component({ selector: "tk-form", template: `<tk-field [(value)]="text"></tk-field>`, imports: [Field] })
    class Form {
      readonly text = signal("first");
      readonly field = query.required(Field);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Form));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("first");
    view.instance.field()
      .value
      .set("second");
    expect(view.instance.text())
      .toBe("second");
    view.instance.text.set("third");
    engine.flush();
    await tick();
    expect(view.instance.field()
      .value())
      .toBe("third");
  });

  test("a two-way binding of a read-only signal, or of something that is not a signal, is an error", async () => {
    @Component({ selector: "tk-read", template: `<input [(value)]="upper">` })
    class Read {
      readonly name = signal("a");
      readonly upper = computed(() => this.name()
        .toUpperCase());
    }
    expect(messageOf(renderComponent(Engine.create(), Read)))
      .toContain("[(value)] on <input>: a two-way binding writes a writable signal, got a read-only signal");
    @Component({ selector: "tk-plain", template: `<input [(value)]="plain">` })
    class Plain {
      readonly plain = Object.assign(() => "a", { set: () => undefined });
    }
    expect(messageOf(renderComponent(Engine.create(), Plain)))
      .toContain("got function");
  });

  test("a property the user does not change, or a call, cannot be bound two ways", () => {
    @Component({ selector: "tk-title", template: `<p [(title)]="name"></p>` })
    class Title {
      readonly name = signal("a");
    }
    expect(messageOf(renderComponent(Engine.create(), Title)))
      .toContain("[(title)] on <p>: no directive or component on it has a model \"title\", and it has no property \"title\" the user changes");
    @Directive({ selector: "[shown]" })
    class Shown {
      readonly value = input("");
    }
    @Component({
      selector: "tk-box",
      template: `<tk-container shown [(value)]="name"></tk-container>`,
      imports: [Shown],
    })
    class Box {
      readonly name = signal("a");
    }
    expect(messageOf(renderComponent(Engine.create(), Box)))
      .toContain("[(value)] on <tk-container>: no directive or component on it has a model \"value\"");
    @Component({ selector: "tk-call", template: `<input [(value)]="name()">` })
    class Call {
      readonly name = signal("a");
    }
    expect(() => renderComponent(Engine.create(), Call))
      .toThrow("[(value)]=\"name()\" on <input>: a two-way binding names a writable signal");
  });
});

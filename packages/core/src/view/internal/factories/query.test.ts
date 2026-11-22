import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, ElementRef, input, QueryMissingError, query, queryAll } from "../../index.ts";
import { Engine } from "../engine.ts";
import { CLASS_REPLACEMENTS } from "../tokens.ts";
import { provide } from "../../../di/index.ts";
import { valueOrThrow } from "@tinker/functional/v1";

@Component({
  selector: "tk-first-item",
  template: "<span>{{ label() }}</span>",
})
class FirstItem {
  readonly label = input("");
}

describe("query", () => {
  test("is the first match in the template, or none when there is none", async () => {
    @Component({
      selector: "tk-first",
      template: "@map labels(); let label; track label { <tk-first-item [label]=\"label\"></tk-first-item> }",
      imports: [FirstItem],
    })
    class First {
      readonly labels = signal<string[]>([]);
      readonly first = query(FirstItem);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(First, { host: el }));
    await tick();
    expect(app.root.instance.first()
      .isNone())
      .toBe(true);
    app.root.instance.labels.set(["a", "b"]);
    await tick();
    expect(app.root.instance.first()
      .getOrThrow(() => new Error("expected a first item"))
      .label())
      .toBe("a");
    app.root.instance.labels.set(["b"]);
    await tick();
    expect(app.root.instance.first()
      .getOrThrow(() => new Error("expected a first item"))
      .label())
      .toBe("b");
    app.destroy();
  });

  test("with read: ElementRef, it is the element of the first match", async () => {
    @Component({
      selector: "tk-first-element",
      template: "<tk-first-item label=\"x\"></tk-first-item><tk-first-item label=\"y\"></tk-first-item>",
      imports: [FirstItem],
    })
    class FirstElement {
      readonly first = query(FirstItem, { read: ElementRef });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(FirstElement, { host: el }));
    await tick();
    const ref = app.root.instance.first()
      .getOrThrow(() => new Error("expected a first element"));
    expect(ref.nativeElement)
      .toBe(el.querySelector("tk-first-item"));
    app.destroy();
  });

  test("query.required is the instance itself, and throws when the template has none", async () => {
    @Component({
      selector: "tk-required",
      template: "@map labels(); let label; track label { <tk-first-item [label]=\"label\"></tk-first-item> }",
      imports: [FirstItem],
    })
    class Required {
      readonly labels = signal<string[]>([]);
      readonly item = query.required(FirstItem);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Required, { host: el }));
    await tick();
    expect(() => app.root.instance.item())
      .toThrow(QueryMissingError);
    app.root.instance.labels.set(["a"]);
    await tick();
    expect(app.root.instance.item()
      .label())
      .toBe("a");
    app.destroy();
  });

  test("the error names the type the template should contain", async () => {
    @Component({
      selector: "tk-required-message",
      template: "<p>nothing here</p>",
    })
    class RequiredMessage {
      readonly item = query.required(FirstItem);
    }
    const app = valueOrThrow(bootstrap(RequiredMessage, { host: document.createElement("section") }));
    await tick();
    expect(() => app.root.instance.item())
      .toThrow("No FirstItem found, which query.required(FirstItem) needs");
    app.destroy();
  });

  test("query.required with read: ElementRef gives the element, and throws when missing", async () => {
    @Component({
      selector: "tk-required-element",
      template: "<p>nothing here</p>",
    })
    class RequiredElement {
      readonly element = query.required(FirstItem, { read: ElementRef });
    }
    const app = valueOrThrow(bootstrap(RequiredElement, { host: document.createElement("section") }));
    await tick();
    expect(() => app.root.instance.element())
      .toThrow(QueryMissingError);
    app.destroy();
  });
});

describe("a query for a replaced class finds its replacement", () => {
  test("query, query.required and queryAll match the replacement on the page", () => {
    @Component({ selector: "tk-gauge", template: "" })
    class Gauge {}
    @Component({ selector: "tk-gauge", template: "" })
    class GaugeStub {}
    @Component({
      selector: "tk-parent",
      template: "<tk-gauge></tk-gauge>",
      imports: [Gauge],
    })
    class Parent {
      readonly first = query(Gauge);
      readonly required = query.required(Gauge);
      readonly all = queryAll(Gauge);
    }
    const el = document.createElement("section");
    const engine = Engine.create({
      providers: [provide(CLASS_REPLACEMENTS, { useValue: new Map([[Gauge, GaugeStub]]) })],
    });
    const parent = valueOrThrow(engine.bootstrap(Parent, el));
    engine.flush();
    expect(parent.instance.first()
      .getOrThrow(() => new Error("no gauge")))
      .toBeInstanceOf(GaugeStub);
    expect(parent.instance.required())
      .toBeInstanceOf(GaugeStub);
    expect(parent.instance.all())
      .toHaveLength(1);
    engine.destroy();
  });
});

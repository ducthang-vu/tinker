import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, ElementRef, input, QueryMissingError, query } from "../../index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

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
    const app = bootstrap(First, { host: el });
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

  test("with read: ElementRef, it is the element of the first match", () => {
    @Component({
      selector: "tk-first-element",
      template: "<tk-first-item label=\"x\"></tk-first-item><tk-first-item label=\"y\"></tk-first-item>",
      imports: [FirstItem],
    })
    class FirstElement {
      readonly first = query(FirstItem, { read: ElementRef });
    }
    const el = document.createElement("section");
    const app = bootstrap(FirstElement, { host: el });
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
    const app = bootstrap(Required, { host: el });
    expect(() => app.root.instance.item())
      .toThrow(QueryMissingError);
    app.root.instance.labels.set(["a"]);
    await tick();
    expect(app.root.instance.item()
      .label())
      .toBe("a");
    app.destroy();
  });

  test("the error names the type the template should contain", () => {
    @Component({
      selector: "tk-required-message",
      template: "<p>nothing here</p>",
    })
    class RequiredMessage {
      readonly item = query.required(FirstItem);
    }
    const app = bootstrap(RequiredMessage, { host: document.createElement("section") });
    expect(() => app.root.instance.item())
      .toThrow("No FirstItem found, which query.required(FirstItem) needs");
    app.destroy();
  });

  test("query.required with read: ElementRef gives the element, and throws when missing", () => {
    @Component({
      selector: "tk-required-element",
      template: "<p>nothing here</p>",
    })
    class RequiredElement {
      readonly element = query.required(FirstItem, { read: ElementRef });
    }
    const app = bootstrap(RequiredElement, { host: document.createElement("section") });
    expect(() => app.root.instance.element())
      .toThrow(QueryMissingError);
    app.destroy();
  });
});

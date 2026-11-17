import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Outlet } from "../../index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe("<template #name> with an outlet", () => {
  test("the declaration renders nothing where it is, and the outlet renders it", async () => {
    @Component({
      selector: "tk-declared",
      template: "<p>before</p><template #var><b>ciao</b></template><template [outlet]=\"var\"></template>",
      imports: [Outlet],
    })
    class Declared {}
    const el = document.createElement("section");
    const app = bootstrap(Declared, { host: el });
    await tick();
    expect(el.querySelectorAll("b"))
      .toHaveLength(1);
    expect(el.querySelector("b")!.textContent)
      .toBe("ciao");
    expect(el.textContent)
      .toBe("beforeciao");
    app.destroy();
  });

  test("each outlet renders its own instance of the template", async () => {
    @Component({
      selector: "tk-twice",
      template: "<template #var><i>x</i></template><template [outlet]=\"var\"></template><p>and</p><template [outlet]=\"var\"></template>",
      imports: [Outlet],
    })
    class Twice {}
    const el = document.createElement("section");
    const app = bootstrap(Twice, { host: el });
    await tick();
    expect(el.querySelectorAll("i"))
      .toHaveLength(2);
    app.destroy();
  });

  test("an instance reads the names the template could read where it was declared", async () => {
    @Component({
      selector: "tk-closure",
      template: "<template #var>{{ title }}</template><template [outlet]=\"var\"></template>",
      imports: [Outlet],
    })
    class Closure {
      readonly title = "from the declaration";
    }
    const el = document.createElement("section");
    const app = bootstrap(Closure, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("from the declaration");
    app.destroy();
  });

  test("the context gives the let- names, and a change of context renders again", async () => {
    @Component({
      selector: "tk-context",
      template: "<template #row let-item><b>{{ item }}</b></template><template [outlet]=\"row\" [context]=\"context()\"></template>",
      imports: [Outlet],
    })
    class Context {
      readonly context = signal<Record<string, unknown>>({ item: "first" });
    }
    const el = document.createElement("section");
    const app = bootstrap(Context, { host: el });
    await tick();
    expect(el.querySelector("b")!.textContent)
      .toBe("first");
    app.root.instance.context.set({ item: "second" });
    await tick();
    expect(el.querySelectorAll("b"))
      .toHaveLength(1);
    expect(el.querySelector("b")!.textContent)
      .toBe("second");
    app.destroy();
  });
});

describe("<template #name> edge cases", () => {
  test("an outlet with no template renders nothing", async () => {
    @Component({
      selector: "tk-no-template",
      template: "<p>only</p><template [outlet]=\"missing\"></template>",
      imports: [Outlet],
    })
    class NoTemplate {
      readonly missing = undefined;
    }
    const el = document.createElement("section");
    const app = bootstrap(NoTemplate, { host: el });
    await tick();
    expect(el.textContent)
      .toBe("only");
    app.destroy();
  });

  test("declaring the same name twice in one template is an error", () => {
    @Component({
      selector: "tk-twice-declared",
      template: "<template #v></template><template #v></template>",
    })
    class TwiceDeclared {}
    expect(() => bootstrap(TwiceDeclared, { host: document.createElement("section") }))
      .toThrow("#v is already declared in this template");
  });
});

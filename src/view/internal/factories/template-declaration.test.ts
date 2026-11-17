import { describe, expect, test } from "vitest";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Outlet } from "../../index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe("<template #name> and the outlet", () => {
  test("the declaration renders nothing; the outlet on a container renders it after the container's content", async () => {
    @Component({
      selector: "tk-declared",
      template: "<p>before</p><template #row><b>ciao</b></template><tk-container [outlet]=\"row\"><i>content</i></tk-container><p>after</p>",
      imports: [Outlet],
    })
    class Declared {}
    const el = document.createElement("section");
    const app = bootstrap(Declared, { host: el });
    await tick();
    expect(el.textContent)
      .toBe("beforecontentciaoafter");
    expect(el.querySelectorAll("b"))
      .toHaveLength(1);
    app.destroy();
  });

  test("each outlet renders its own instance", async () => {
    @Component({
      selector: "tk-twice-outlet",
      template: "<template #row><i>x</i></template><tk-container [outlet]=\"row\"></tk-container><p>and</p><tk-container [outlet]=\"row\"></tk-container>",
      imports: [Outlet],
    })
    class TwiceOutlet {}
    const el = document.createElement("section");
    const app = bootstrap(TwiceOutlet, { host: el });
    await tick();
    expect(el.querySelectorAll("i"))
      .toHaveLength(2);
    app.destroy();
  });

  test("an instance reads the component's fields, as the declaration could", async () => {
    @Component({
      selector: "tk-closure-template",
      template: "<template #row>{{ title }}</template><tk-container [outlet]=\"row\"></tk-container>",
      imports: [Outlet],
    })
    class ClosureTemplate {
      readonly title = "from the declaration";
    }
    const el = document.createElement("section");
    const app = bootstrap(ClosureTemplate, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("from the declaration");
    app.destroy();
  });

  test("an outlet on a real element renders the template after the element", async () => {
    @Component({
      selector: "tk-element-outlet",
      template: "<template #row><b>x</b></template><div [outlet]=\"row\"></div>",
      imports: [Outlet],
    })
    class ElementOutlet {}
    const el = document.createElement("section");
    const app = bootstrap(ElementOutlet, { host: el });
    await tick();
    expect(el.querySelector("div")!.childElementCount)
      .toBe(0);
    expect(el.querySelector("b")!.textContent)
      .toBe("x");
    app.destroy();
  });

  test("an outlet with no template renders nothing", async () => {
    @Component({
      selector: "tk-no-outlet-template",
      template: "<p>only</p><tk-container [outlet]=\"missing\"></tk-container>",
      imports: [Outlet],
    })
    class NoOutletTemplate {
      readonly missing = undefined;
    }
    const el = document.createElement("section");
    const app = bootstrap(NoOutletTemplate, { host: el });
    await tick();
    expect(el.textContent)
      .toBe("only");
    app.destroy();
  });

  test("a declaration with let- names is not supported yet", () => {
    @Component({
      selector: "tk-let-template",
      template: "<template #row let-item></template>",
    })
    class LetTemplate {}
    expect(() => bootstrap(LetTemplate, { host: document.createElement("section") }))
      .toThrow("its let- names are not supported yet");
  });

  test("declaring the same name twice in one template is an error", () => {
    @Component({
      selector: "tk-twice-template",
      template: "<template #row></template><template #row></template>",
    })
    class TwiceTemplate {}
    expect(() => bootstrap(TwiceTemplate, { host: document.createElement("section") }))
      .toThrow("#row is already declared in this template");
  });
});

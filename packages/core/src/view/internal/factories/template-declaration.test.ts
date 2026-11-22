import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { inject } from "../../../di/index.ts";
import { Component, Directive, input, Outlet, type TemplateRef, ViewContainerRef, queryAll } from "../../index.ts";
import { valueOrThrow } from "@tinker/functional";

describe("<template #name> and the outlet", () => {
  test("the declaration renders nothing; the outlet on a container renders it after the container's content", async () => {
    @Component({
      selector: "tk-declared",
      template: "<p>before</p><template #row><b>ciao</b></template><tk-container [outlet]=\"row\"><i>content</i></tk-container><p>after</p>",
      imports: [Outlet],
    })
    class Declared {}
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Declared, { host: el }));
    await tick();
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
    const app = valueOrThrow(bootstrap(TwiceOutlet, { host: el }));
    await tick();
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
    const app = valueOrThrow(bootstrap(ClosureTemplate, { host: el }));
    await tick();
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
    const app = valueOrThrow(bootstrap(ElementOutlet, { host: el }));
    await tick();
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
    const app = valueOrThrow(bootstrap(NoOutletTemplate, { host: el }));
    await tick();
    await tick();
    expect(el.textContent)
      .toBe("only");
    app.destroy();
  });

  test("the context gives each let- name its value", async () => {
    @Component({
      selector: "tk-context-template",
      template: "<template #row let-item><b>{{ item }}</b></template><tk-container [outlet]=\"row\" [context]=\"ctx\"></tk-container>",
      imports: [Outlet],
    })
    class ContextTemplate {
      readonly ctx = { item: "x" };
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(ContextTemplate, { host: el }));
    await tick();
    await tick();
    expect(el.querySelector("b")!.textContent)
      .toBe("x");
    app.destroy();
  });

  test("a changed context updates the instance in place", async () => {
    @Component({
      selector: "tk-changed-context",
      template: "<template #row let-item><b>{{ item }}</b></template><tk-container [outlet]=\"row\" [context]=\"ctx()\"></tk-container>",
      imports: [Outlet],
    })
    class ChangedContext {
      readonly ctx = signal<Record<string, unknown>>({ item: "first" });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(ChangedContext, { host: el }));
    await tick();
    await tick();
    const before = el.querySelector("b");
    app.root.instance.ctx.set({ item: "second" });
    await tick();
    expect(el.querySelectorAll("b"))
      .toHaveLength(1);
    expect(el.querySelector("b"))
      .toBe(before);
    expect(el.querySelector("b")!.textContent)
      .toBe("second");
    app.destroy();
  });

  test("a context change with no template renders nothing", async () => {
    @Component({
      selector: "tk-empty-outlet-context",
      template: "<p>only</p><tk-container [outlet]=\"missing\" [context]=\"ctx()\"></tk-container>",
      imports: [Outlet],
    })
    class EmptyOutletContext {
      readonly missing = undefined;
      readonly ctx = signal<Record<string, unknown>>({});
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(EmptyOutletContext, { host: el }));
    await tick();
    await tick();
    app.root.instance.ctx.set({ item: "x" });
    await tick();
    expect(el.textContent)
      .toBe("only");
    app.destroy();
  });

  test("a let- name must be a plain name", () => {
    @Component({
      selector: "tk-bad-let",
      template: "<template #row let-1x></template>",
    })
    class BadLet {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(BadLet, document.createElement("section")))

      .toThrow("is not a name");
  });

  test("declaring the same name twice in one template is an error", () => {
    @Component({
      selector: "tk-twice-template",
      template: "<template #row></template><template #row></template>",
    })
    class TwiceTemplate {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(TwiceTemplate, document.createElement("section")))

      .toThrow("#row is already declared in this template");
  });
});

describe("code can render a declared template too", () => {
  test("ViewContainerRef.createEmbeddedView renders an instance with plain values", async () => {
    @Directive({ selector: "[renders]" })
    class Renders {
      readonly renders = input<TemplateRef | undefined>(undefined);
      readonly container = inject(ViewContainerRef);
    }
    @Component({
      selector: "tk-code-render",
      template: "<template #row let-item><b>{{ item }}</b></template><tk-container [renders]=\"row\"></tk-container>",
      imports: [Renders],
    })
    class CodeRender {
      readonly found = queryAll(Renders);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(CodeRender, { host: el }));
    await tick();
    await tick();
    const [host] = app.root.instance.found();
    host!.container.createEmbeddedView(host!.renders()!, { item: "from code" });
    expect(el.querySelector("b")!.textContent)
      .toBe("from code");
    app.destroy();
  });
});

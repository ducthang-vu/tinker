import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive, input } from "../../index.ts";

@Directive({ selector: "[mark]" })
class Mark {}

@Directive({ selector: "[marker]", exportAs: "marker" })
class Marker {
  readonly label = "marked";
}

@Component({ selector: "tk-named", template: "<i>named</i>", exportAs: "named" })
class Named {
  readonly hello = () => "hello";
}

@Component({
  selector: "tk-tagged",
  template: "<span>{{ label() }}</span>",
})
class Tagged {
  readonly label = input("");
}

describe("template references", () => {
  test("#name is the native element, and its properties can be read", async () => {
    @Component({
      selector: "tk-ref",
      template: "<p #para>{{ para.tagName }}</p>",
    })
    class Ref {}
    const el = document.createElement("section");
    const app = bootstrap(Ref, { host: el });
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("P");
    app.destroy();
  });

  test("the reference is the native element even when a directive is on it", async () => {
    @Component({
      selector: "tk-ref-directive",
      template: "<p #para mark>{{ para.tagName }}</p>",
      imports: [Mark],
    })
    class RefDirective {}
    const el = document.createElement("section");
    const app = bootstrap(RefDirective, { host: el });
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("P");
    app.destroy();
  });

  test("the reference is the host element even when a component is on it", async () => {
    @Component({
      selector: "tk-ref-component",
      template: "<tk-tagged #item label=\"hi\"></tk-tagged><p>{{ item.tagName }}</p>",
      imports: [Tagged],
    })
    class RefComponent {}
    const el = document.createElement("section");
    const app = bootstrap(RefComponent, { host: el });
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("TK-TAGGED");
    app.destroy();
  });

  test("a reference can be read before its element in the template", async () => {
    @Component({
      selector: "tk-ref-forward",
      template: "<p>{{ later.tagName }}</p><span #later></span>",
    })
    class RefForward {}
    const el = document.createElement("section");
    const app = bootstrap(RefForward, { host: el });
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("SPAN");
    app.destroy();
  });

  test("a reference inside an @if branch names that branch's element", async () => {
    @Component({
      selector: "tk-ref-branch",
      template: "@if (on()) { <b #inner>{{ inner.tagName }}</b> }",
    })
    class RefBranch {
      readonly on = signal(false);
    }
    const el = document.createElement("section");
    const app = bootstrap(RefBranch, { host: el });
    await tick();
    app.root.instance.on.set(true);
    await tick();
    expect(el.querySelector("b")!.textContent)
      .toBe("B");
    app.destroy();
  });

  test("declaring the same name twice in one template is an error", () => {
    @Component({
      selector: "tk-ref-twice",
      template: "<p #box></p><span #box></span>",
    })
    class RefTwice {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(RefTwice, document.createElement("section")))

      .toThrow("#box is already declared in this template");
  });

  test("#name=\"exportAs\" is the instance of the directive with that exportAs", () => {
    @Component({
      selector: "tk-export",
      template: "<p #m=\"marker\" marker>{{ m.label }}</p>",
      imports: [Marker],
    })
    class ExportRef {}
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = engine.bootstrap(ExportRef, el);
    engine.flush();
    expect(el.querySelector("p")!.textContent)
      .toBe("marked");
    app.destroy();
  });

  test("##name is the component on the element, while #name is still the element", async () => {
    @Component({
      selector: "tk-both",
      template: "<tk-tagged #el ##item label=\"hi\"></tk-tagged><p>{{ el.tagName }} {{ item.label() }}</p>",
      imports: [Tagged],
    })
    class Both {}
    const el = document.createElement("section");
    const app = bootstrap(Both, { host: el });
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("TK-TAGGED hi");
    app.destroy();
  });

  test("#name=\"exportAs\" also finds a component by its exportAs", () => {
    @Component({
      selector: "tk-named-ref",
      template: "<tk-named #n=\"named\"></tk-named><p>{{ n.hello() }}</p>",
      imports: [Named],
    })
    class NamedRef {}
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = engine.bootstrap(NamedRef, el);
    engine.flush();
    expect(el.querySelector("p")!.textContent)
      .toBe("hello");
    app.destroy();
  });

  test("an exportAs that no directive on the element has is an error", () => {
    @Component({
      selector: "tk-missing-export",
      template: "<p #m=\"nope\"></p>",
    })
    class MissingExport {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(MissingExport, document.createElement("section")))

      .toThrow("no directive on <p> is exported as \"nope\"");
  });

  test("##name on an element with no component is an error", () => {
    @Component({
      selector: "tk-no-component",
      template: "<p ##item></p>",
    })
    class NoComponent {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(NoComponent, document.createElement("section")))

      .toThrow("has no component");
  });
});

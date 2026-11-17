import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive, input } from "../../index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

@Directive({ selector: "[mark]" })
class Mark {}

@Component({
  selector: "tk-tagged",
  template: "<span>{{ label() }}</span>",
})
class Tagged {
  readonly label = input("");
}

describe("template references", () => {
  test("#name is the native element, and its properties can be read", () => {
    @Component({
      selector: "tk-ref",
      template: "<p #para>{{ para.tagName }}</p>",
    })
    class Ref {}
    const el = document.createElement("section");
    const app = bootstrap(Ref, { host: el });
    expect(el.querySelector("p")!.textContent)
      .toBe("P");
    app.destroy();
  });

  test("the reference is the native element even when a directive is on it", () => {
    @Component({
      selector: "tk-ref-directive",
      template: "<p #para mark>{{ para.tagName }}</p>",
      imports: [Mark],
    })
    class RefDirective {}
    const el = document.createElement("section");
    const app = bootstrap(RefDirective, { host: el });
    expect(el.querySelector("p")!.textContent)
      .toBe("P");
    app.destroy();
  });

  test("the reference is the host element even when a component is on it", () => {
    @Component({
      selector: "tk-ref-component",
      template: "<tk-tagged #item label=\"hi\"></tk-tagged><p>{{ item.tagName }}</p>",
      imports: [Tagged],
    })
    class RefComponent {}
    const el = document.createElement("section");
    const app = bootstrap(RefComponent, { host: el });
    expect(el.querySelector("p")!.textContent)
      .toBe("TK-TAGGED");
    app.destroy();
  });

  test("a reference can be read before its element in the template", () => {
    @Component({
      selector: "tk-ref-forward",
      template: "<p>{{ later.tagName }}</p><span #later></span>",
    })
    class RefForward {}
    const el = document.createElement("section");
    const app = bootstrap(RefForward, { host: el });
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
    expect(() => bootstrap(RefTwice, { host: document.createElement("section") }))
      .toThrow("#box is already declared in this template");
  });
});

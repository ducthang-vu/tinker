import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";

describe("event modifiers in templates and host listeners", () => {
  test("(click.prevent.once) in a template: the default is cancelled, and the handler runs once", async () => {
    let calls = 0;
    @Component({ selector: "tk-a", template: `<a href="#x" (click.prevent.once)="go()">x</a>` })
    class A {
      go() {
        calls += 1;
      }
    }
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    const link = host.querySelector("a")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick();
    expect(event.defaultPrevented)
      .toBe(true);
    expect(calls)
      .toBe(1);
  });

  test("\"(click.self)\" in a host option: a click on a child does not reach the handler", () => {
    let calls = 0;
    @Directive({
      selector: "[guard]",
      host: { "(click.self)": "hit()" },
    })
    class Guard {
      hit() {
        calls += 1;
      }
    }
    @Component({
      selector: "tk-a",
      template: `<div guard><span>x</span></div>`,
      imports: [Guard],
    })
    class A {}
    const host = document.createElement("section");
    Engine.create()
      .createComponent(A, host);
    host.querySelector("span")!.click();
    expect(calls)
      .toBe(0);
    host.querySelector("div")!.click();
    expect(calls)
      .toBe(1);
  });

  test("an unknown modifier in a template is a compile error, naming it", () => {
    @Component({ selector: "tk-a", template: `<button (click.prevnt)="go()">x</button>` })
    class A {
      go() {}
    }
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow(`(click.prevnt) on <button>: no directive or component has the selector "click", or a DOM modifier such as .prevent`);
  });
});

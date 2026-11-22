import { afterEach, describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { output, type Output } from "../authoring/output.ts";
import { valueOrThrow } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A directive with an output named like a key modifier, `enter`. */
@Directive({ selector: "[keys]", host: { "(click)": "press()" } })
class Keys {
  readonly enter: Output<void> = output<void>();
  press() {
    this.enter.emit();
  }
}

describe("an output named like a key modifier", () => {
  test("(owner.enter) is the output when the owner has one, not the DOM key event", async () => {
    @Component({
      selector: "tk-a",
      template: `<button keys (keys.enter)="seen()">x</button>`,
      imports: [Keys],
    })
    class A {
      count = 0;
      seen() {
        this.count++;
      }
    }
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(A));
    const button = view.host.nativeElement.querySelector("button")!;
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await tick();
    expect(view.instance.count)
      .toBe(0);
    button.click();
    expect(view.instance.count)
      .toBe(1);
  });

  test("(keydown.space) is the DOM key event: no directive with the selector keydown", async () => {
    @Component({
      selector: "tk-b",
      template: `<button keys (keydown.space)="seen()">x</button>`,
      imports: [Keys],
    })
    class B {
      count = 0;
      seen() {
        this.count++;
      }
    }
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(B));
    const button = view.host.nativeElement.querySelector("button")!;
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await tick();
    expect(view.instance.count)
      .toBe(0);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(view.instance.count)
      .toBe(1);
  });
});

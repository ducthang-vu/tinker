import { afterEach, describe, expect, test } from "vitest";
import { inject } from "../../di/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { output, type Output } from "../authoring/output.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A picker directive: emits its id when clicked, and completes when destroyed. */
@Directive({ selector: "[pick]", host: { "(click)": "pick()" } })
class Pick {
  readonly id = 7;
  readonly selected: Output<number> = output<number>();
  pick() {
    this.selected.emit(this.id);
  }
}

describe("output bindings in templates", () => {
  test("(name)=\"method($event)\" calls the component's method with each value of the directive's output", () => {
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="choose($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      readonly chosen: number[] = [];
      choose(id: number) {
        this.chosen.push(id);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    view.host.querySelector("button")!.click();
    view.host.querySelector("button")!.click();
    expect(view.component.chosen)
      .toEqual([7, 7]);
  });

  test("(name)=\"method()\" calls the method with no argument", () => {
    const seen: unknown[][] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="done()">x</button>`,
      imports: [Pick],
    })
    class A {
      done(...args: unknown[]) {
        seen.push(args);
      }
    }
    const view = Engine.create()
      .createComponent(A);
    view.host.querySelector("button")!.click();
    expect(seen)
      .toEqual([[]]);
  });

  test("the subscription ends with the view: a later emit reaches nobody", () => {
    const chosen: number[] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="choose($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      choose(id: number) {
        chosen.push(id);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const button = view.host.querySelector("button")!;
    view.destroy();
    button.click(); // the directive is gone: nothing is called
    expect(chosen)
      .toEqual([]);
  });

  test("a directive's output is completed when the directive is destroyed: emitting after is ignored", () => {
    const heard: number[] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="choose($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      choose(id: number) {
        heard.push(id);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const button = view.host.querySelector("button")!;
    const [pick] = engine.getContext(button)
      .map((context) => context.directives)
      .getOrElse([]) as [Pick];
    button.click();
    view.destroy();
    pick!.selected.emit(99); // after the end: nothing reaches the template
    expect(heard)
      .toEqual([7]);
  });

  test("names match case-insensitively", () => {
    const chosen: number[] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick (SELECTED)="choose($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      choose(id: number) {
        chosen.push(id);
      }
    }
    const view = Engine.create()
      .createComponent(A);
    view.host.querySelector("button")!.click();
    expect(chosen)
      .toEqual([7]);
  });

  test("a binding with no output of that name on the element is an error, and leaves nothing behind", () => {
    @Component({
      selector: "tk-a",
      template: `<button pick (other)="choose()">x</button>`,
      imports: [Pick],
    })
    class A {
      choose() {}
    }
    const host = document.createElement("div");
    const engine = Engine.create();
    expect(() => engine.createComponent(A, host))
      .toThrow(`(other) on <button>: no directive or component on this element has an output "other"`);
    expect(host.innerHTML)
      .toBe("");
    expect(engine.getContext(host)
      .isNone())
      .toBe(true);
  });

  test("the component must have the method", () => {
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="missing($event)">x</button>`,
      imports: [Pick],
    })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow(`A has no method "missing" for output "(selected)"`);
  });

  test("an output binding on an element no directive matches is a compile error", () => {
    @Component({ selector: "tk-a", template: `<button (click)="go()">x</button>`, imports: [] })
    class A {
      go() {}
    }
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow("(click) on <button>: only outputs of directives and components can be bound");
  });

  test("an invalid handler is reported where it is written", () => {
    @Component({
      selector: "tk-a",
      template: `<button pick (selected)="a + b">x</button>`,
      imports: [Pick],
    })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow(`Unsupported event handler "a + b": write "method()" or "method($event)", on <button>`);
  });

  test("a directive can emit from its own host listener, and the template receives the value", () => {
    @Directive({ selector: "[counter]", host: { "(click)": "bump()" } })
    class Counter {
      readonly count = output<number>();
      private value = 0;
      bump() {
        this.count.emit(++this.value);
      }
    }
    @Component({
      selector: "tk-a",
      template: `<button counter (count)="seen($event)">x</button>`,
      imports: [Counter],
    })
    class A {
      readonly seen_: number[] = [];
      seen(value: number) {
        this.seen_.push(value);
      }
    }
    const view = Engine.create()
      .createComponent(A);
    const button = view.host.querySelector("button")!;
    button.click();
    button.click();
    expect(view.component.seen_)
      .toEqual([1, 2]);
  });

  test("a directive's output may be used by another directive on the element, via inject", () => {
    @Directive({ selector: "[relay]" })
    class Relay {
      readonly picked: number[] = [];
      readonly pick = inject(Pick);
    }
    @Component({
      selector: "tk-a",
      template: `<button pick relay>x</button>`,
      imports: [Pick, Relay],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [pick, relay] = engine.getContext(view.host.querySelector("button")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Pick, Relay];
    expect(relay.pick)
      .toBe(pick);
  });
});

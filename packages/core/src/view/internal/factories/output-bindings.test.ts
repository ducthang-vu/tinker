import { afterEach, describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { inject } from "../../../di/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { output, type Output } from "../authoring/output.ts";
import { valueOrThrow, getOrElse, map, match } from "@tinker/functional/v1";

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
    const view = valueOrThrow(engine.createComponent(A));
    view.host.nativeElement.querySelector("button")!.click();
    view.host.nativeElement.querySelector("button")!.click();
    expect(view.instance.chosen)
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
    const view = valueOrThrow(Engine.create()
      .createComponent(A));
    view.host.nativeElement.querySelector("button")!.click();
    expect(seen)
      .toEqual([[]]);
  });

  test("the subscription ends with the view: a later emit reaches nobody", async () => {
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
    const view = valueOrThrow(engine.createComponent(A));
    const button = view.host.nativeElement.querySelector("button")!;
    view.destroy();
    button.click(); // the directive is gone: nothing is called
    await tick();
    expect(chosen)
      .toEqual([]);
  });

  test("a directive's output is completed when the directive is destroyed: emitting after is ignored", async () => {
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
    const view = valueOrThrow(engine.createComponent(A));
    const button = view.host.nativeElement.querySelector("button")!;
    const [pick] = getOrElse(
      map(engine.getContext(button), (context) => context.directives),
      [],
    ) as [Pick];
    button.click();
    view.destroy();
    pick!.selected.emit(99); // after the end: nothing reaches the template
    await tick();
    expect(heard)
      .toEqual([7]);
  });

  test("names match case-insensitively", async () => {
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
    const view = valueOrThrow(Engine.create()
      .createComponent(A));
    view.host.nativeElement.querySelector("button")!.click();
    await tick();
    expect(chosen)
      .toEqual([7]);
  });

  test("a binding with no output of that name listens to the DOM event on the element", async () => {
    const calls: unknown[] = [];
    @Component({
      selector: "tk-a",
      template: `<button pick (other)="choose($event)">x</button>`,
      imports: [Pick],
    })
    class A {
      choose(event: unknown) {
        calls.push(event);
      }
    }
    const host = document.createElement("div");
    const engine = Engine.create();
    engine.createComponent(A, host);
    host.querySelector("button")!.dispatchEvent(new Event("other"));
    await tick();
    expect(calls)
      .toHaveLength(1);
    expect(calls[0])
      .toBeInstanceOf(Event);
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
      .toThrow(`A has no method "missing" for event "(selected)"`);
  });

  test("a click on an element with no directive is a DOM event, with no directive needed", async () => {
    let clicks = 0;
    @Component({ selector: "tk-a", template: `<button (click)="go()">x</button>` })
    class A {
      go() {
        clicks += 1;
      }
    }
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    host.querySelector("button")!.click();
    await tick();
    expect(clicks)
      .toBe(1);
  });

  test("a directive output and a DOM event with the same name both fire", async () => {
    const seen: string[] = [];
    @Directive({ selector: "[relay]", host: { "(click)": "relay()" } })
    class Relay {
      readonly click = output<string>();

      relay() {
        this.click.emit("from output");
      }
    }
    @Component({
      selector: "tk-a",
      template: `<button relay (click)="log($event)">x</button>`,
      imports: [Relay],
    })
    class A {
      log(value: unknown) {
        seen.push(value instanceof Event ? "from DOM event" : String(value));
      }
    }
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    host.querySelector("button")!.click();
    await tick();
    expect(seen.sort())
      .toEqual(["from DOM event", "from output"]);
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
      .toThrow(`Unsupported event handler "a + b": write a call of a method, as in "method()", "method($event)" or "g.method()", on <button>`);
  });

  test("a directive can emit from its own host listener, and the template receives the value", async () => {
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
    const view = valueOrThrow(Engine.create()
      .createComponent(A));
    const button = view.host.nativeElement.querySelector("button")!;
    button.click();
    button.click();
    await tick();
    expect(view.instance.seen_)
      .toEqual([1, 2]);
  });

  test("a directive's output may be used by another directive on the element, via inject", async () => {
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
    const view = valueOrThrow(engine.createComponent(A));
    const [pick, relay] = getOrElse(map(engine.getContext(view.host.nativeElement.querySelector("button")!), (context) => context.directives), []) as [Pick, Relay];
    await tick();
    expect(relay.pick)
      .toBe(pick);
  });
});

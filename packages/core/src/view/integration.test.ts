// Integration: the view layer with the rest of Tinker, with no test doubles. Each
// test mounts a real app with bootstrap and drives it through real DOM events, then
// checks the DOM after each change. They cover components, DI, directives, inputs,
// outputs, model, queries, templates, change detection, effects and the functional
// values.

import { afterEach, describe, expect, test } from "vitest";
import { tick } from "./internal/test-support.ts";
import { match, map, type Either, pipe, toError, Left, Right, Some, None, fromNullable, getOrElse, flatMap } from "@tinker/functional";
import {
  bootstrap,
  Component,
  computed,
  Directive,
  Effects,
  inject,
  Injectable,
  input,
  model,
  query,
  queryAll,
  signal,
} from "../index.ts";

/** Lets scheduled work (change detection, effects) run. */

let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
});

/** Mount `type` into a fresh element attached to the document. */
async function mount<T extends object>(type: new () => T) {
  host = document.createElement("section");
  document.body.appendChild(host);
  const app = bootstrap(type, { host });
  await tick();
  return { app, el: host };
}

describe("a shared store, a directive that changes it, and a list that shows it", () => {
  @Injectable()
  class Cart {
    readonly items = signal<string[]>([]);
    readonly count = computed(() => this.items().length);
    add(name: string): void {
      this.items.update((items) => [...items, name]);
    }
  }

  @Directive({ selector: "[add]", host: { "(click)": "buy()" } })
  class Add {
    private readonly cart = inject(Cart);
    readonly item = input("");
    buy(): void {
      this.cart.add(this.item());
    }
  }

  @Component({
    selector: "tk-shop",
    providers: [Cart],
    imports: [Add],
    template: `<p>{{ cart.count() }} in cart</p>`
      + `<ul>@map cart.items(); let item { <li>{{ item }}</li> }</ul>`
      + `<button add item="tea">tea</button><button add item="jam">jam</button>`,
  })
  class Shop {
    readonly cart = inject(Cart);
  }

  test("clicks change the store, and the count and the list follow", async () => {
    const { app, el } = await mount(Shop);
    const buttons = el.querySelectorAll("button");
    expect(el.querySelector("p")!.textContent)
      .toBe("0 in cart");
    buttons[0]!.click();
    buttons[1]!.click();
    buttons[0]!.click();
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("3 in cart");
    expect([...el.querySelectorAll("li")].map((li) => li.textContent))
      .toEqual(["tea", "jam", "tea"]);
    app.destroy();
  });
});

describe("a parent and child linked by an input, an output and a model", () => {
  @Component({
    selector: "tk-slider",
    template: `<input (input)="setFrom($event.target.value)"><span>{{ value() }}</span>`,
  })
  class Slider {
    readonly value = model(0);
    setFrom(text: string): void {
      this.value.set(Number(text));
    }
  }

  @Component({
    selector: "tk-panel",
    imports: [Slider],
    template: `<tk-slider [value]="level()" (valueChange)="setLevel($event)"></tk-slider>`
      + `<p>{{ sliders().length }} slider, level {{ level() }}</p>`,
  })
  class Panel {
    readonly level = signal(3);
    readonly sliders = queryAll(Slider);
    readonly first = query.required(Slider);
    setLevel(value: number): void {
      this.level.set(value);
    }
  }

  test("a parent value reaches the child, and the child's change reaches the parent", async () => {
    const { app, el } = await mount(Panel);
    expect(el.querySelector("span")!.textContent)
      .toBe("3");
    app.root.instance.level.set(5);
    await tick();
    expect(el.querySelector("span")!.textContent)
      .toBe("5");

    const input = el.querySelector("input")!;
    input.value = "7";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(app.root.instance.level())
      .toBe(7);
    expect(el.querySelector("p")!.textContent)
      .toBe("1 slider, level 7");
    expect(app.root.instance.first()
      .value())
      .toBe(7);
    app.destroy();
  });
});

describe("a template that reacts to several signals at once", () => {
  @Component({
    selector: "tk-status",
    template: `<p [class]="{ busy: status() === 'loading', done: done() }">`
      + `@match status() { @case "loading" { loading } @case "error" { failed } @default { idle } }`
      + `</p>`
      + `<p>{{ user()?.name ?? "guest" }}</p>`
      + `<input (keydown.enter)="submit()">`
      + `<p>submitted {{ submitted() }}</p>`,
  })
  class Status {
    readonly status = signal<"idle" | "loading" | "error">("idle");
    readonly done = signal(false);
    readonly user = signal<{ name?: string } | null>(null);
    readonly submitted = signal(0);
    submit(): void {
      this.submitted.update((n) => n + 1);
    }
  }

  test("each signal changes its part of the view, and keys reach the handler", async () => {
    const { app, el } = await mount(Status);
    const paragraphs = () => [...el.querySelectorAll("p")];
    expect(paragraphs()[0]!.textContent!.trim())
      .toBe("idle");
    expect(paragraphs()[0]!.className)
      .toBe("");
    expect(paragraphs()[1]!.textContent)
      .toBe("guest");

    const view = app.root.instance;
    view.status.set("loading");
    view.done.set(true);
    view.user.set({ name: "Ada" });
    await tick();
    expect(paragraphs()[0]!.textContent!.trim())
      .toBe("loading");
    expect(paragraphs()[0]!.className)
      .toBe("busy done");
    expect(paragraphs()[1]!.textContent)
      .toBe("Ada");

    const input = el.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await tick();
    expect(paragraphs()[2]!.textContent)
      .toBe("submitted 1");
    app.destroy();
  });
});

describe("effects and cleanup end with the app", () => {
  @Component({ selector: "tk-clock", template: `<p>{{ count() }}</p>` })
  class Clock {
    readonly count = signal(0);
    readonly runs: number[] = [];
    readonly destroyed: string[] = [];
    private readonly effects = inject(Effects);
    private readonly track = this.effects.create(() => {
      this.runs.push(this.count());
    });

    onDestroy(): void {
      this.destroyed.push("clock");
    }
  }

  test("an effect runs with the latest value after changes, and stops when the app is destroyed", async () => {
    const { app } = await mount(Clock);
    const clock = app.root.instance;
    clock.count.set(1);
    clock.count.set(2);
    await tick();
    expect(clock.runs.at(-1))
      .toBe(2);
    const runsBefore = clock.runs.length;
    app.destroy();
    clock.count.set(3);
    await tick();
    expect(clock.runs)
      .toHaveLength(runsBefore);
    expect(clock.destroyed)
      .toEqual(["clock"]);
  });
});

describe("a computed built from functional values, shown in the view", () => {
  @Component({
    selector: "tk-port",
    template: `<input (input)="setRaw($event.target.value)"><p>{{ port() }}</p>`,
  })
  class Port {
    readonly raw = signal<string | null>(null);
    readonly port = computed(() => getOrElse(pipe(
      fromNullable(this.raw()),
      flatMap((text) => (text.trim() === "" ? None.of<string>() : Some.of(text))),
      map((text: string) => Number(text)),
      map((n: number) => (Number.isInteger(n) && n > 0 ? n : 8080)),
    ), 8080));

    setRaw(text: string): void {
      this.raw.set(text);
    }
  }

  test("a valid port shows, and a missing or empty value falls back to the default", async () => {
    const { app, el } = await mount(Port);
    expect(el.querySelector("p")!.textContent)
      .toBe("8080");
    const input = el.querySelector("input")!;
    input.value = "3000";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("3000");
    input.value = "  ";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("8080");
    app.destroy();
  });

  test("a parse error travels as an Either value, not a throw", () => {
    const parse = (text: string) => {
      try {
        return Right.of<unknown, Error>(JSON.parse(text) as unknown);
      } catch (error) {
        return Left.of<Error, unknown>(toError(error));
      }
    };
    expect(match(parse("{"), { Left: () => true, Right: () => false }))
      .toBe(true);
    expect(match(parse("[1]"), { Left: () => null, Right: (value) => value }))
      .toEqual([1]);
  });
});

describe("a parent updates before the child it contains", () => {
  @Injectable()
  class Level {
    readonly level = signal(1);
  }

  let childRenders = 0;

  @Component({
    selector: "tk-child",
    template: `<p>{{ shown() }}</p>`,
  })
  class Child {
    readonly value = input(0);
    private readonly levelStore = inject(Level);
    /** Reads the shared signal and the input, so it renders when either changes. */
    shown(): string {
      childRenders += 1;
      return `${this.value()} at ${this.levelStore.level()}`;
    }
  }

  @Component({
    selector: "tk-parent",
    providers: [Level],
    imports: [Child],
    template: `<tk-child [value]="level.level() * 10"></tk-child>`,
  })
  class Parent {
    readonly level = inject(Level);
  }

  test("the child renders once for one change, after the parent has passed it its new input", async () => {
    childRenders = 0;
    const { app, el } = await mount(Parent);
    expect(childRenders)
      .toBe(1);
    app.root.instance.level.level.set(2);
    await tick();
    expect(el.querySelector("p")!.textContent)
      .toBe("20 at 2");
    expect(childRenders)
      .toBe(2);
    app.destroy();
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { Injectable, inject } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Engine } from "../engine.ts";
import { Component } from "./decorators.ts";
import { Effect, type EffectContext, Effects } from "./effects.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Effects", () => {
  test("runs in the next tick, then again when what it read changes", async () => {
    const runs: number[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      constructor() {
        inject(Effects)
          .create(() => void runs.push(this.count()));
      }
    }
    const view = Engine.create()
      .createComponent(A);
    expect(runs)
      .toEqual([]); // not during create
    await Promise.resolve();
    expect(runs)
      .toEqual([1]);
    view.component.count.set(2);
    view.component.count.set(3);
    await Promise.resolve();
    expect(runs)
      .toEqual([1, 3]);
  });

  test("runs before the views: a view sees what an effect wrote in the same tick", () => {
    @Component({ selector: "tk-a", template: "<p>{{ doubled() }}</p>" })
    class A {
      readonly count = signal(1);
      readonly doubled = signal(0);
      constructor() {
        inject(Effects)
          .create(() => this.doubled.set(this.count() * 2));
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    expect(view.host.textContent)
      .toBe("2");
    view.component.count.set(5);
    engine.flush();
    expect(view.host.textContent)
      .toBe("10");
  });

  test("onCleanup runs before the next run and on destroy; destroy stops it", () => {
    const log: string[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      readonly handle = inject(Effects)
        .create(({ onCleanup }) => {
          const value = this.count();
          log.push(`run ${value}`);
          onCleanup(() => log.push(`cleanup ${value}`));
        });
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush();
    component.count.set(2);
    engine.flush();
    component.handle.destroy();
    component.count.set(3);
    engine.flush();
    expect(log)
      .toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
  });

  test("works in services and components, which can inject() too", () => {
    const log: string[] = [];
    @Injectable({ providedIn: "root" })
    class Clock {
      readonly time = signal(0);
      constructor() {
        inject(Effects)
          .create(() => void log.push(`service ${this.time()}`));
      }
    }
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly clock = inject(Clock);
      constructor() {
        inject(Effects)
          .create(() => void log.push(`component ${this.clock.time()}`));
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    expect(log)
      .toEqual(["service 0", "component 0"]);
    view.component.clock.time.set(1);
    engine.flush();
    expect(log)
      .toEqual(["service 0", "component 0", "service 1", "component 1"]);
  });

  test("isFirst is true on the first run only", () => {
    const runs: [number, boolean][] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      constructor() {
        inject(Effects)
          .create(({ isFirst }) => void runs.push([this.count(), isFirst]));
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush();
    component.count.set(2);
    engine.flush();
    component.count.set(3);
    engine.flush();
    expect(runs)
      .toEqual([
        [1, true],
        [2, false],
        [3, false],
      ]);
  });

  test("an effect that throws on its first run still counts it as its first", () => {
    const firsts: boolean[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      constructor() {
        inject(Effects)
          .create(({ isFirst }) => {
            firsts.push(isFirst);
            if (this.count() === 1) {
              throw new Error("first run failed");
            }
          });
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    expect(() => engine.flush())
      .toThrow("first run failed");
    component.count.set(2);
    engine.flush();
    expect(firsts)
      .toEqual([true, false]);
  });

  test("create can be called at any moment, not only during construction", () => {
    const runs: number[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      private readonly effects = inject(Effects);
      readonly count = signal(1);
      start() {
        return this.effects.create(() => void runs.push(this.count()));
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush();
    expect(runs)
      .toEqual([]);
    component.start(); // long after construction, e.g. in a click handler
    engine.flush();
    expect(runs)
      .toEqual([1]);
  });

  test("two engines run their effects in their own ticks", () => {
    const runs: string[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly name = signal("");
      constructor() {
        inject(Effects)
          .create(() => void runs.push(this.name()));
      }
    }
    const one = Engine.create();
    const two = Engine.create();
    one.createComponent(A).component.name.set("one");
    two.createComponent(A).component.name.set("two");
    one.flush();
    expect(runs)
      .toEqual(["one"]);
    two.flush();
    expect(runs)
      .toEqual(["one", "two"]);
  });
});

describe("@Effect()", () => {
  test("makes the method an effect of each instance, with the run's context and this", () => {
    const runs: string[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly name = "a";
      readonly count = signal(1);
      @Effect() track({ isFirst, onCleanup }: EffectContext) {
        const value = this.count();
        runs.push(`${this.name} ${value} ${isFirst ? "first" : "again"}`);
        onCleanup(() => runs.push(`cleanup ${value}`));
      }
    }
    const engine = Engine.create();
    const first = engine.createComponent(A).component;
    engine.createComponent(A);
    engine.flush();
    first.count.set(2);
    engine.flush();
    expect(runs)
      .toEqual(["a 1 first", "a 1 first", "cleanup 1", "a 2 again"]);
  });

  test("works on services too", () => {
    const runs: number[] = [];
    @Injectable({ providedIn: "root" })
    class Store {
      readonly size = signal(0);
      @Effect() log() {
        runs.push(this.size());
      }
    }
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly store = inject(Store);
    }
    const engine = Engine.create();
    engine.createComponent(A).component.store.size.set(3);
    engine.flush();
    expect(runs)
      .toEqual([3]);
  });

  test("an instance created outside an injection context cannot have effects", () => {
    class Plain {
      @Effect() run() {}
    }
    expect(() => new Plain())
      .toThrow("inject() must be called in an injection context");
  });
});

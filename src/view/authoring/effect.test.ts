import { afterEach, describe, expect, test } from "vitest";
import { Injectable, inject } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Engine } from "../engine.ts";
import { Component } from "./decorators.ts";
import { effect } from "./effect.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("effect", () => {
  test("runs in the next tick, then again when what it read changes", async () => {
    const runs: number[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      constructor() {
        effect(() => void runs.push(this.count()));
      }
    }
    const view = Engine.create().createComponent(A);
    expect(runs).toEqual([]); // not during create
    await Promise.resolve();
    expect(runs).toEqual([1]);
    view.component.count.set(2);
    view.component.count.set(3);
    await Promise.resolve();
    expect(runs).toEqual([1, 3]);
  });

  test("runs before the views: a view sees what an effect wrote in the same tick", () => {
    @Component({ selector: "tk-a", template: "<p>{{ doubled() }}</p>" })
    class A {
      readonly count = signal(1);
      readonly doubled = signal(0);
      constructor() {
        effect(() => this.doubled.set(this.count() * 2));
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    expect(view.host.textContent).toBe("2");
    view.component.count.set(5);
    engine.flush();
    expect(view.host.textContent).toBe("10");
  });

  test("onCleanup runs before the next run and on destroy; destroy stops it", () => {
    const log: string[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      readonly handle = effect(({ onCleanup }) => {
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
    expect(log).toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
  });

  test("works in services and components, which can inject() too", () => {
    const log: string[] = [];
    @Injectable({ providedIn: "root" })
    class Clock {
      readonly time = signal(0);
      constructor() {
        effect(() => void log.push(`service ${this.time()}`));
      }
    }
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly clock = inject(Clock);
      constructor() {
        effect(() => void log.push(`component ${this.clock.time()}`));
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    expect(log).toEqual(["service 0", "component 0"]);
    view.component.clock.time.set(1);
    engine.flush();
    expect(log).toEqual(["service 0", "component 0", "service 1", "component 1"]);
  });

  test("isFirst is true on the first run only", () => {
    const runs: [number, boolean][] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly count = signal(1);
      constructor() {
        effect(({ isFirst }) => void runs.push([this.count(), isFirst]));
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush();
    component.count.set(2);
    engine.flush();
    component.count.set(3);
    engine.flush();
    expect(runs).toEqual([
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
        effect(({ isFirst }) => {
          firsts.push(isFirst);
          if (this.count() === 1) {
            throw new Error("first run failed");
          }
        });
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    expect(() => engine.flush()).toThrow("first run failed");
    component.count.set(2);
    engine.flush();
    expect(firsts).toEqual([true, false]);
  });

  test("must be called in an injection context", () => {
    expect(() => effect(() => {})).toThrow("inject() must be called in an injection context");
  });

  test("two engines run their effects in their own ticks", () => {
    const runs: string[] = [];
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly name = signal("");
      constructor() {
        effect(() => void runs.push(this.name()));
      }
    }
    const one = Engine.create();
    const two = Engine.create();
    one.createComponent(A).component.name.set("one");
    two.createComponent(A).component.name.set("two");
    one.flush();
    expect(runs).toEqual(["one"]);
    two.flush();
    expect(runs).toEqual(["one", "two"]);
  });
});

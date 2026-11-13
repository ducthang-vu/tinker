import { afterEach, describe, expect, test } from "vitest";
import { inject, Injectable, InjectionToken, provide } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Effect, Effects } from "../authoring/effects.ts";
import { AfterEachRender, RenderHooks } from "../authoring/render-hooks.ts";
import { Engine } from "../engine.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("each component has its own injector", () => {
  test("component providers: each instance gets its own, destroyed with it", () => {
    const destroyed: number[] = [];
    let created = 0;
    @Injectable()
    class Counter {
      readonly id = ++created;
      onDestroy() {
        destroyed.push(this.id);
      }
    }
    @Component({ selector: "tk-a", template: "", providers: [Counter] })
    class A {
      readonly counter = inject(Counter);
    }
    const engine = Engine.create();
    const first = engine.createComponent(A);
    const second = engine.createComponent(A);

    expect(first.component.counter)
      .not.toBe(second.component.counter);
    first.destroy();
    expect(destroyed)
      .toEqual([1]);
    second.destroy();
    expect(destroyed)
      .toEqual([1, 2]);
  });

  test("a token is looked up in the component's injector first, then the engine's", () => {
    const NAME = new InjectionToken<string>("NAME");
    const COLOR = new InjectionToken<string>("COLOR");
    @Component({ selector: "tk-a", template: "", providers: [provide(NAME, { useValue: "component" })] })
    class A {
      readonly name = inject(NAME);
      readonly color = inject(COLOR);
    }
    const engine = Engine.create({
      providers: [provide(NAME, { useValue: "engine" }), provide(COLOR, { useValue: "red" })],
    });
    const { component } = engine.createComponent(A);
    expect([component.name, component.color])
      .toEqual(["component", "red"]);
  });

  test("the component's providers can inject the component's other providers and the engine's", () => {
    @Injectable({ providedIn: "root" })
    class Api {
      readonly url = "/api";
    }
    @Injectable()
    class Store {
      readonly api = inject(Api);
    }
    @Component({ selector: "tk-a", template: "", providers: [Store] })
    class A {
      readonly store = inject(Store);
    }
    expect(Engine.create()
      .createComponent(A).component.store.api.url)
      .toBe("/api");
  });

  test("a component whose constructor throws leaves its injector destroyed", () => {
    const destroyed: string[] = [];
    @Injectable()
    class Resource {
      onDestroy() {
        destroyed.push("resource");
      }
    }
    @Component({ selector: "tk-a", template: "", providers: [Resource] })
    class A {
      readonly resource = inject(Resource);
      constructor() {
        throw new Error("constructor failed");
      }
    }
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow("constructor failed");
    expect(destroyed)
      .toEqual(["resource"]);
  });

  test("a failing first render destroys the injector with the view", () => {
    const destroyed: string[] = [];
    @Injectable()
    class Resource {
      onDestroy() {
        destroyed.push("resource");
      }
    }
    @Component({ selector: "tk-a", template: "<p>{{ fail() }}</p>", providers: [Resource] })
    class A {
      readonly resource = inject(Resource);
      fail(): string {
        throw new Error("render failed");
      }
    }
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow("render failed");
    expect(destroyed)
      .toEqual(["resource"]);
  });
});

describe("effects and render hooks stop with their component", () => {
  test("effects created by a component are destroyed with it, decorated ones too", () => {
    const runs: string[] = [];
    const count = signal(1);
    @Component({ selector: "tk-a", template: "" })
    class A {
      constructor() {
        inject(Effects)
          .create(() => void runs.push(`created ${count()}`));
      }

      @Effect() decorated() {
        runs.push(`decorated ${count()}`);
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    view.destroy();
    count.set(2);
    engine.flush();
    expect(runs)
      .toEqual(["decorated 1", "created 1"]);
  });

  test("render hooks registered by a component are cancelled with it, decorated ones too", () => {
    const runs: string[] = [];
    const count = signal(1);
    @Component({ selector: "tk-a", template: "<p>{{ value() }}</p>" })
    class A {
      value() {
        return count();
      }

      constructor() {
        inject(RenderHooks)
          .afterEachRender(() => runs.push("hook"));
      }

      @AfterEachRender() decorated() {
        runs.push("decorated");
      }
    }
    @Component({ selector: "tk-b", template: "<p>{{ value() }}</p>" })
    class B {
      value() {
        return count();
      }
    }
    const engine = Engine.create();
    const a = engine.createComponent(A);
    engine.createComponent(B); // keeps rendering after A is gone
    engine.flush();
    expect(runs)
      .toEqual(["decorated", "hook"]);
    a.destroy();
    count.set(2);
    engine.flush();
    expect(runs)
      .toEqual(["decorated", "hook"]);
  });

  test("each component gets its own Effects and RenderHooks", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {
      readonly effects = inject(Effects);
      readonly render = inject(RenderHooks);
    }
    const engine = Engine.create();
    const first = engine.createComponent(A).component;
    const second = engine.createComponent(A).component;
    expect(first.effects)
      .not.toBe(second.effects);
    expect(first.render)
      .not.toBe(second.render);
  });
});

describe("the component in its own injector", () => {
  test("its onDestroy() runs when its view is destroyed, after its template's directives", () => {
    const log: string[] = [];
    @Directive({ selector: "[part]" })
    class Part {
      onDestroy() {
        log.push("part");
      }
    }
    @Component({ selector: "tk-a", template: "<p part></p>", imports: [Part] })
    class A {
      onDestroy() {
        log.push("component");
      }
    }
    const view = Engine.create()
      .createComponent(A);
    expect(log)
      .toEqual([]);
    view.destroy();
    expect(log)
      .toEqual(["part", "component"]);
  });

  test("the directives of its template can inject it", () => {
    @Directive({ selector: "[part]" })
    class Part {
      readonly owner = inject(A);
    }
    @Component({ selector: "tk-a", template: "<p part></p>", imports: [Part] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [part] = engine.getContext(view.host.querySelector("p")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Part];
    expect(part.owner)
      .toBe(view.component);
  });
});

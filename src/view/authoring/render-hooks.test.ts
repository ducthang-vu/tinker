import { afterEach, describe, expect, test } from "vitest";
import { inject } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Engine } from "../engine.ts";
import { ChangeDetectionLoopError } from "../runtime/change-detection.ts";
import { Component } from "./decorators.ts";
import { Effects } from "./effects.ts";
import { AfterEachRender, AfterNextRender, RenderHooks } from "./render-hooks.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RenderHooks (alone)", () => {
  test("each-render hooks run every time, next-render hooks once, in that order", () => {
    const hooks = new RenderHooks();
    const log: string[] = [];
    hooks.afterNextRender(() => log.push("next"));
    hooks.afterEachRender(() => log.push("each"));
    expect(hooks.hasHooks).toBe(true);
    hooks.rendered();
    hooks.rendered();
    expect(log).toEqual(["each", "next", "each"]);
  });

  test("cancelling removes a hook; the same function registered twice runs twice", () => {
    const hooks = new RenderHooks();
    const log: string[] = [];
    const push = () => log.push("hook");
    hooks.afterEachRender(push);
    const cancel = hooks.afterEachRender(push);
    hooks.afterNextRender(() => log.push("next")); // cancelled below, before it runs
    const cancelNext = hooks.afterNextRender(() => log.push("cancelled"));
    cancelNext();
    cancel();
    cancel();
    hooks.rendered();
    expect(log).toEqual(["hook", "next"]);
  });

  test("a hook registered while hooks run waits for the next render", () => {
    const hooks = new RenderHooks();
    const log: string[] = [];
    hooks.afterNextRender(() => hooks.afterNextRender(() => log.push("later")));
    hooks.rendered();
    expect(log).toEqual([]);
    hooks.rendered();
    expect(log).toEqual(["later"]);
  });

  test("every hook runs even if one throws; the first error is re-thrown", () => {
    const hooks = new RenderHooks();
    const log: string[] = [];
    hooks.afterEachRender(() => {
      throw new Error("first");
    });
    hooks.afterNextRender(() => log.push("next"));
    expect(() => hooks.rendered()).toThrow("first");
    expect(log).toEqual(["next"]);
  });

  test("has no hooks until one is registered", () => {
    const hooks = new RenderHooks();
    expect(hooks.hasHooks).toBe(false);
    hooks.afterNextRender(() => {});
    hooks.rendered();
    expect(hooks.hasHooks).toBe(false);
  });
});

describe("RenderHooks in change detection", () => {
  /** A component rendering a counter, with its hooks service exposed. */
  function setup() {
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      readonly render = inject(RenderHooks);
      readonly count = signal(1);
    }
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    return { engine, view, component: view.component };
  }

  test("run after the views rendered, seeing the updated DOM", () => {
    const { engine, view, component } = setup();
    const seen: string[] = [];
    component.render.afterEachRender(() => seen.push(view.host.textContent!));
    component.count.set(2);
    engine.flush();
    component.count.set(3);
    engine.flush();
    expect(seen).toEqual(["2", "3"]);
  });

  test("a new component's first render runs the hooks in the next tick, by itself", async () => {
    const seen: string[] = [];
    @Component({ selector: "tk-b", template: "<p>{{ label }}</p>" })
    class B {
      label = "ready";
      constructor() {
        inject(RenderHooks).afterNextRender(() => seen.push(view.host.textContent!));
      }
    }
    const view = Engine.create().createComponent(B);
    expect(seen).toEqual([]); // not during create
    await Promise.resolve();
    expect(seen).toEqual(["ready"]);
  });

  test("a tick that renders nothing runs no hooks", () => {
    const { engine, component } = setup();
    const seen: string[] = [];
    component.render.afterEachRender(() => seen.push("rendered"));
    engine.flush();
    expect(seen).toEqual([]);
  });

  test("afterNextRender at any moment: e.g. after a change in a handler", () => {
    const { engine, view, component } = setup();
    const seen: string[] = [];
    component.count.set(5);
    component.render.afterNextRender(() => seen.push(view.host.textContent!));
    engine.flush();
    component.count.set(6);
    engine.flush();
    expect(seen).toEqual(["5"]);
  });

  test("a hook writing a signal re-renders in the same tick, then hooks run again", () => {
    const { engine, view, component } = setup();
    const seen: string[] = [];
    component.render.afterNextRender(() => component.count.set(100));
    component.render.afterEachRender(() => seen.push(view.host.textContent!));
    component.count.set(2);
    engine.flush();
    expect(view.host.textContent).toBe("100");
    expect(seen).toEqual(["2", "100"]);
  });

  test("hooks run after the effects and views of the round", () => {
    const log: string[] = [];
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      readonly count = signal(1);
      constructor() {
        inject(Effects).create(() => void log.push(`effect ${this.count()}`));
        inject(RenderHooks).afterEachRender(() => log.push("rendered"));
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush();
    component.count.set(2);
    engine.flush();
    // First tick: the effect's first run, then the hooks for the first render.
    expect(log).toEqual(["effect 1", "rendered", "effect 2", "rendered"]);
  });

  test("a hook always writing what a view reads is stopped by the loop guard", () => {
    const { engine, component } = setup();
    component.render.afterEachRender(() => component.count.update((n) => n + 1));
    component.count.set(2);
    expect(() => engine.flush()).toThrow(ChangeDetectionLoopError);
  });

  test("afterStable completes after the render hooks", async () => {
    const { engine, component } = setup();
    const log: string[] = [];
    component.render.afterNextRender(() => log.push("hook"));
    component.count.set(2);
    await engine.afterStable().toPromise();
    log.push("stable");
    expect(log).toEqual(["hook", "stable"]);
  });
});

describe("@AfterEachRender() and @AfterNextRender()", () => {
  test("register the methods of each instance, called with the instance as this", () => {
    const log: string[] = [];
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      readonly count = signal(1);
      host?: Element;
      @AfterNextRender() attach() {
        log.push(`attach ${this.count()}`);
      }
      @AfterEachRender() resize() {
        log.push(`resize ${this.count()}`);
      }
    }
    const engine = Engine.create();
    const { component } = engine.createComponent(A);
    engine.flush(); // the hooks run for the first render, made during create
    component.count.set(2);
    engine.flush();
    component.count.set(3);
    engine.flush();
    expect(log).toEqual(["resize 1", "attach 1", "resize 2", "resize 3"]);
  });

  test("an instance created outside an injection context cannot have hooks", () => {
    class Plain {
      @AfterEachRender() each() {}
    }
    class Other {
      @AfterNextRender() next() {}
    }
    expect(() => new Plain()).toThrow("inject() must be called in an injection context");
    expect(() => new Other()).toThrow("inject() must be called in an injection context");
  });
});

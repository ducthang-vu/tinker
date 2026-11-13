import { describe, expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { Component, Directive } from "../decorators.ts";
import { ElementContexts } from "../element-contexts.ts";
import { DomRenderer } from "../renderer.ts";
import { RENDERER } from "../tokens.ts";
import { View } from "../view.ts";
import { DirectiveFactory } from "./directive-factory.ts";

/** A DirectiveFactory created the way the engine creates it: through an injector. */
function setup() {
  const renderer = new DomRenderer();
  const { injector } = Injector.create({
    providers: [provide(RENDERER, { useValue: renderer }), ElementContexts, DirectiveFactory],
  });
  const { factory, contexts } = runInInjectionContext(injector, () => ({
    factory: inject(DirectiveFactory),
    contexts: inject(ElementContexts),
  }));
  const element = document.createElement("button");
  const view = new View(document.createElement("div"), {}, [], renderer);
  return { factory, contexts, element, view };
}

describe("DirectiveFactory", () => {
  test("create makes the instance and registers it in the element's context", () => {
    @Directive({ selector: "[tooltip]" })
    class Tooltip {}
    const { factory, contexts, element, view } = setup();

    const tooltip = factory.create(Tooltip, element, view);

    expect(tooltip).toBeInstanceOf(Tooltip);
    expect(contexts.get(element)?.directives).toEqual([tooltip]);
  });

  test("create applies the host listeners", () => {
    @Directive({ selector: "[counter]", host: { "(click)": "increment()" } })
    class Counter {
      count = 0;
      increment() {
        this.count++;
      }
    }
    const { factory, element, view } = setup();
    const counter = factory.create(Counter, element, view);
    element.click();
    element.click();
    expect(counter.count).toBe(2);
  });

  test("destroying the view removes the listeners and the directive from the context", () => {
    @Directive({ selector: "[counter]", host: { "(click)": "increment()" } })
    class Counter {
      count = 0;
      increment() {
        this.count++;
      }
    }
    @Directive({ selector: "[other]" })
    class Other {}
    const { factory, contexts, element, view } = setup();
    const counter = factory.create(Counter, element, view);
    const otherView = new View(document.createElement("div"), {}, [], new DomRenderer());
    const other = factory.create(Other, element, otherView);

    view.destroy();
    element.click();

    expect(counter.count).toBe(0);
    expect(contexts.get(element)?.directives).toEqual([other]);
    otherView.destroy();
    expect(contexts.get(element)).toBeUndefined();
  });

  test("several directives on one element", () => {
    @Directive({ selector: "[a]" })
    class A {}
    @Directive({ selector: "[b]" })
    class B {}
    const { factory, contexts, element, view } = setup();
    const a = factory.create(A, element, view);
    const b = factory.create(B, element, view);
    expect(contexts.get(element)?.directives).toEqual([a, b]);
  });

  test("components are directives too: their host is read the same way", () => {
    @Component({ selector: "tk-x", template: "", host: { "(click)": "go()" } })
    class X {
      go() {}
    }
    expect(setup().factory.metadataOf(X).host).toEqual({ "(click)": "go()" });
  });

  test("throws for a class that is not a directive", () => {
    class Plain {}
    const { factory, element, view } = setup();
    expect(() => factory.create(Plain, element, view)).toThrow(
      "Plain is not a directive: decorate it with @Directive",
    );
  });
});

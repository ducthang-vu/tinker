import { describe, expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { Component } from "../decorators.ts";
import { ElementContexts } from "../element-contexts.ts";
import { input } from "../input.ts";
import { DomRenderer } from "../renderer.ts";
import { BrowserTemplateParser } from "../template/browser-parser.ts";
import { RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { ComponentFactory } from "./component-factory.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import { ViewScheduler } from "../view-scheduler.ts";

/** A ComponentFactory created the way the engine creates it: through an injector. */
function makeFactory() {
  const { injector } = Injector.create({
    providers: [
      provide(RENDERER, { useValue: new DomRenderer() }),
      provide(TEMPLATE_PARSER, { useValue: new BrowserTemplateParser() }),
      ElementContexts,
      ViewScheduler,
      DirectiveFactory,
      ComponentFactory,
    ],
  });
  return runInInjectionContext(injector, () => ({
    factory: inject(ComponentFactory),
    contexts: inject(ElementContexts),
    scheduler: inject(ViewScheduler),
  }));
}

describe("ComponentFactory", () => {
  test("metadataOf gives the component's metadata, or throws", () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    class NotAComponent {}
    const { factory } = makeFactory();
    expect(factory.metadataOf(A)).toEqual({ selector: "tk-a", template: "<p>a</p>" });
    expect(() => factory.metadataOf(NotAComponent)).toThrow(
      "NotAComponent is not a component: decorate it with @Component",
    );
  });

  test("create renders into the host and registers the view in the shared contexts", () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    const { factory, contexts } = makeFactory();
    const host = document.createElement("section");

    const view = factory.create(A, host);

    expect(host.innerHTML).toBe("<p>a</p>");
    expect(view.component).toBeInstanceOf(A);
    expect(contexts.get(host).flatMap((context) => context.componentView).getOrElse(undefined)).toBe(view);
  });

  test("records the component's inputs on its view, for setInput", () => {
    @Component({ selector: "tk-card", template: "" })
    class Card {
      readonly title = input<string>();
      readonly size = input(1);
    }
    const view = makeFactory().factory.create(Card);

    view.setInput("title", "Hello");

    expect(view.component.title()).toBe("Hello");
    expect(view.component.size()).toBe(1);
  });

  test("destroying the view forgets its now-empty context", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const { factory, contexts } = makeFactory();
    const view = factory.create(A);
    view.destroy();
    expect(contexts.get(view.host).isNone()).toBe(true);
  });

  test("without a host, creates one from the selector", () => {
    @Component({ selector: "tk-b[flag]", template: "" })
    class B {}
    expect(makeFactory().factory.create(B).host.outerHTML).toBe(`<tk-b flag=""></tk-b>`);
  });
});

describe("ComponentFactory host listeners", () => {
  test("a click on the component's host calls its method", () => {
    @Component({
      selector: "tk-toggle",
      template: "<span>toggle me</span>",
      host: { "(click)": "toggle()" },
    })
    class Toggle {
      open = false;
      toggle() {
        this.open = !this.open;
      }
    }
    const view = makeFactory().factory.create(Toggle);
    (view.host.querySelector("span") as HTMLElement).click(); // bubbles to the host
    expect(view.component.open).toBe(true);
    view.destroy();
    (view.host as HTMLElement).click();
    expect(view.component.open).toBe(true); // listener removed with the view
  });

  test("a missing method is reported when the component is created", () => {
    @Component({ selector: "tk-broken", template: "", host: { "(click)": "missing()" } })
    class Broken {}
    expect(() => makeFactory().factory.create(Broken)).toThrow(
      `Broken has no method "missing" for host listener "(click)"`,
    );
  });
});

describe("ComponentFactory view watch", () => {
  test("each view gets a watch, scheduled on the app's scheduler", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const { factory, scheduler } = makeFactory();
    factory.create(A);
    factory.create(A);
    expect(scheduler.pending).toBe(2); // first run of each view's watch
    scheduler.flush();
    expect(scheduler.pending).toBe(0);
  });

  test("a view destroyed before the flush has nothing left to run", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const { factory, scheduler } = makeFactory();
    factory.create(A).destroy();
    expect(() => scheduler.flush()).not.toThrow();
  });
});

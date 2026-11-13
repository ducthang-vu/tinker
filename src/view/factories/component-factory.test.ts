import { describe, expect, test } from "vitest";
import { inject, Injector, provide, type Provider, runInInjectionContext } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Component } from "../authoring/decorators.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { input } from "../authoring/input.ts";
import { DomRenderer } from "../renderer.ts";
import { BrowserTemplateParser } from "../template/browser-parser.ts";
import { RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { ComponentFactory } from "./component-factory.ts";
import { BindingFactory } from "../runtime/text-binding.ts";
import { type View, ViewFactory } from "../runtime/view.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import { TemplateBuilderFactory } from "./template-builder.ts";
import { RenderHookRegistry } from "../runtime/render-hook-registry.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import { EffectScheduler } from "../runtime/schedulers/effect-scheduler.ts";
import { Ticker } from "../runtime/ticker.ts";
import { ViewScheduler } from "../runtime/schedulers/view-scheduler.ts";

/** A ComponentFactory created the way the engine creates it: through an injector. */
function makeFactory(overrides: readonly Provider[] = []) {
  const { injector } = Injector.create({
    providers: [
      ...overrides,
      provide(RENDERER, { useValue: new DomRenderer() }),
      provide(TEMPLATE_PARSER, { useValue: new BrowserTemplateParser() }),
      ElementContexts,
      Ticker,
      EffectScheduler,
      ViewScheduler,
      RenderHookRegistry,
      ChangeDetection,
      DirectiveFactory,
      ViewFactory,
      BindingFactory,
      TemplateBuilderFactory,
      ComponentFactory,
    ],
  });
  return runInInjectionContext(injector, () => ({
    factory: inject(ComponentFactory),
    contexts: inject(ElementContexts),
    scheduler: inject(ChangeDetection).views,
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
  test("renders {{ }} during create: the first run is not scheduled", () => {
    @Component({ selector: "tk-a", template: "<p>Count: {{ count() }}!</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);
    expect(view.host.innerHTML).toBe("<p>Count: 1!</p>");
    expect(scheduler.pending).toBe(0);
  });

  test("a signal change schedules the view, and the flush updates the text", () => {
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);

    view.component.count.set(2);
    expect(scheduler.pending).toBe(1);
    expect(view.host.textContent).toBe("1");
    scheduler.flush();
    expect(view.host.textContent).toBe("2");
  });

  test("only texts whose value changed are written", () => {
    @Component({ selector: "tk-a", template: "<p>{{ a() }}</p><p>{{ b() }}</p>" })
    class A {
      a = signal("a");
      b = signal("b");
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);
    const [first, second] = [...view.host.querySelectorAll("p")].map((p) => p.firstChild as Text);
    const writes: string[] = [];
    new MutationObserver((records) => writes.push(...records.map((r) => r.target.textContent!))).observe(
      view.host,
      { characterData: true, subtree: true },
    );

    view.component.b.set("B");
    scheduler.flush();

    expect(first!.data).toBe("a");
    expect(second!.data).toBe("B");
    return Promise.resolve().then(() => expect(writes).toEqual(["B"]));
  });

  test("text without {{ }} is static, and plain fields are read once", () => {
    @Component({ selector: "tk-a", template: "<p>static</p><p>{{ title }}</p>" })
    class A {
      title = "Tinker";
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);
    view.component.title = "changed";
    expect(scheduler.pending).toBe(0);
    expect(view.host.innerHTML).toBe("<p>static</p><p>Tinker</p>");
  });

  test("a component input bound with setInput updates the template", () => {
    @Component({ selector: "tk-card", template: "<h1>{{ title() }}</h1>" })
    class Card {
      readonly title = input("untitled");
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(Card);
    expect(view.host.textContent).toBe("untitled");
    view.setInput("title", "Hello");
    scheduler.flush();
    expect(view.host.textContent).toBe("Hello");
  });

  test("an error in the first render throws, and leaves nothing behind", () => {
    @Component({ selector: "tk-card", template: "<h1>{{ title() }}</h1><p>{{ count() }}</p>" })
    class Card {
      readonly title = input<string>();
      count = signal(0);
    }
    const { factory, contexts, scheduler } = makeFactory();
    const host = document.createElement("div");

    expect(() => factory.create(Card, host)).toThrow(`Input "title" of Card was read before it was bound`);

    expect(host.innerHTML).toBe("");
    expect(contexts.get(host).isNone()).toBe(true);
    expect(scheduler.pending).toBe(0);
  });

  test("a later error is thrown by the flush, and the view keeps working", () => {
    @Component({ selector: "tk-a", template: "<p>{{ value() }}</p>" })
    class A {
      fail = signal(false);
      value = () => {
        if (this.fail()) {
          throw new Error("boom");
        }
        return "ok";
      };
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);
    view.component.fail.set(true);
    expect(() => scheduler.flush()).toThrow("boom");
    view.component.fail.set(false);
    scheduler.flush();
    expect(view.host.textContent).toBe("ok");
  });

  test("a destroyed view no longer updates", () => {
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = factory.create(A);
    view.destroy();
    view.component.count.set(2);
    expect(scheduler.pending).toBe(0);
  });

  test("reports an invalid {{ }} before rendering anything", () => {
    @Component({ selector: "tk-a", template: "<p>{{ a + b }}</p>" })
    class A {}
    const { factory } = makeFactory();
    const host = document.createElement("div");
    expect(() => factory.create(A, host)).toThrow(`Unexpected "+"`);
    expect(host.innerHTML).toBe("");
  });
});

describe("ComponentFactory collaborators", () => {
  test("creates views through the injected ViewFactory", () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    const created: unknown[] = [];
    class RecordingViewFactory extends ViewFactory {
      override create<T>(host: Element, component: T, nodes: readonly Node[]): View<T> {
        created.push(component);
        return super.create(host, component, nodes);
      }
    }
    const { factory } = makeFactory([provide(ViewFactory, { useClass: RecordingViewFactory })]);

    const view = factory.create(A);

    expect(created).toEqual([view.component]);
  });
});

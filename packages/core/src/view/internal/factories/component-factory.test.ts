import { DEV_MODE } from "../tokens.ts";
import { ElementScope } from "../factories/element-scope.ts";
import { messageOf, tick } from "../test-support.ts";
import { describe, expect, test } from "vitest";
import { inject, Injector, provide, type Provider, runInInjectionContext } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { ElementContexts } from "../runtime/element-contexts.ts";
import { input } from "../authoring/input.ts";
import { DomRenderer } from "../renderer.ts";
import { TinkerTemplateParser } from "../template/tinker-parser.ts";
import { CLASS_REPLACEMENTS, RENDERER, TEMPLATE_PARSER } from "../tokens.ts";
import { ComponentFactory } from "./component-factory.ts";
import { BindingFactory } from "../runtime/text-binding.ts";
import { type ComponentView, ComponentViewFactory } from "../runtime/component-view.ts";
import { DirectiveFactory } from "./directive-factory.ts";
import { TemplateBuilderFactory } from "./template-builder.ts";
import { RenderHookRegistry } from "../runtime/render-hook-registry.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import { EffectScheduler } from "../runtime/schedulers/effect-scheduler.ts";
import { Ticker } from "../runtime/ticker.ts";
import { ViewScheduler } from "../runtime/schedulers/view-scheduler.ts";
import { EmbeddedViewFactory } from "./embedded-view-factory.ts";
import type { ViewNode } from "../runtime/schedulers/view-scheduler.ts";
import { valueOrThrow, isNone, getOrElse, flatMap } from "@tinker/functional";

/** A ComponentFactory created the way the engine creates it: through an injector. */
function makeFactory(overrides: readonly Provider[] = []) {
  const { injector } = Injector.create({
    providers: [
      ...overrides,
      provide(RENDERER, { useValue: new DomRenderer() }),
      provide(DEV_MODE, { useValue: false }),
      provide(TEMPLATE_PARSER, { useValue: new TinkerTemplateParser() }),
      provide(CLASS_REPLACEMENTS, { useValue: new Map() }),
      ElementContexts,
      Ticker,
      EffectScheduler,
      ViewScheduler,
      RenderHookRegistry,
      ChangeDetection,
      DirectiveFactory,
      ElementScope,
      ComponentViewFactory,
      BindingFactory,
      TemplateBuilderFactory,
      EmbeddedViewFactory,
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
  test("metadataOf gives the component's metadata, or an error", () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    class NotAComponent {}
    const { factory } = makeFactory();
    expect(valueOrThrow(factory.metadataOf(A)))
      .toEqual({ selector: "tk-a", template: "<p>a</p>" });
    expect(messageOf(factory.metadataOf(NotAComponent)))
      .toBe("NotAComponent is not a component: decorate it with @Component");
  });

  test("create renders into the host and registers the view in the shared contexts", async () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    const { factory, contexts } = makeFactory();
    const host = document.createElement("section");

    const view = valueOrThrow(factory.create(A, host));

    await tick();

    expect(host.innerHTML)
      .toBe("<p>a</p>");
    expect(view.component)
      .toBeInstanceOf(A);
    expect(getOrElse(flatMap(contexts.get(host), (context) => context.componentView), undefined))
      .toBe(view);
  });

  test("records the component's inputs on its view, for setInput", async () => {
    @Component({ selector: "tk-card", template: "" })
    class Card {
      readonly title = input<string>();
      readonly size = input(1);
    }
    const view = valueOrThrow(makeFactory().factory.create(Card));

    view.setInput("title", "Hello");

    await tick();

    expect(view.component.title())
      .toBe("Hello");
    expect(view.component.size())
      .toBe(1);
  });

  test("destroying the view forgets its now-empty context", async () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const { factory, contexts } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    view.destroy();
    await tick();
    expect(isNone(contexts.get(view.host)))
      .toBe(true);
  });

  test("without a host, creates one from the selector", async () => {
    @Component({ selector: "tk-b[flag]", template: "" })
    class B {}
    await tick();
    expect(valueOrThrow(makeFactory().factory.create(B)).host.outerHTML)
      .toBe(`<tk-b flag=""></tk-b>`);
  });
});

describe("ComponentFactory host listeners", () => {
  test("a click on the component's host calls its method", async () => {
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
    const view = valueOrThrow(makeFactory().factory.create(Toggle));
    (view.host.querySelector("span") as HTMLElement).click(); // bubbles to the host
    await tick();
    expect(view.component.open)
      .toBe(true);
    view.destroy();
    (view.host as HTMLElement).click();
    expect(view.component.open)
      .toBe(true); // listener removed with the view
  });

  test("a missing method is reported when the component is created", () => {
    @Component({ selector: "tk-broken", template: "", host: { "(click)": "missing()" } })
    class Broken {}
    expect(() => makeFactory().factory.create(Broken))
      .toThrow(
        `Broken has no method "missing" for host listener "(click)"`,
      );
  });

  test("an invalid host option is a Left from create, not a throw", () => {
    @Component({ selector: "tk-bad-host", template: "", host: { bogus: "x" } })
    class BadHost {}
    const result = makeFactory().factory.create(BadHost);
    expect(() => valueOrThrow(result))
      .toThrow("Unsupported host binding");
  });

  test("an invalid host option of a directive in the template is a Left from create", () => {
    @Directive({ selector: "[tk-bad-in-template]", host: { bogus: "x" } })
    class BadInTemplate {}
    @Component({
      selector: "tk-uses-bad-directive",
      template: "<p tk-bad-in-template></p>",
      imports: [BadInTemplate],
    })
    class UsesBadDirective {}
    const result = makeFactory().factory.create(UsesBadDirective);
    expect(() => valueOrThrow(result))
      .toThrow("Unsupported host binding");
  });

  test("an invalid host option in a child component's template is a Left from create", () => {
    @Directive({ selector: "[tk-bad-in-child]", host: { bogus: "x" } })
    class BadInChild {}
    @Component({ selector: "tk-child-bad", template: "<p tk-bad-in-child></p>", imports: [BadInChild] })
    class ChildBad {}
    @Component({ selector: "tk-parent-ok", template: "<tk-child-bad></tk-child-bad>", imports: [ChildBad] })
    class ParentOk {}
    const result = makeFactory().factory.create(ParentOk);
    expect(() => valueOrThrow(result))
      .toThrow("Unsupported host binding");
  });

  test("an invalid host option of a host directive is a Left from create", () => {
    @Directive({ selector: "[tk-bad-directive]", host: { bogus: "x" } })
    class BadDirective {}
    @Component({ selector: "tk-with-bad-directive", template: "", hostDirectives: [BadDirective] })
    class WithBadDirective {}
    const result = makeFactory().factory.create(WithBadDirective);
    expect(() => valueOrThrow(result))
      .toThrow("Unsupported host binding");
  });
});

describe("ComponentFactory view watch", () => {
  test("the first render is queued by create, and runs on the flush", () => {
    @Component({ selector: "tk-a", template: "<p>Count: {{ count() }}!</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    expect(scheduler.pending)
      .toBe(1);
    expect(view.host.innerHTML)
      .toBe("<p></p>");
    scheduler.flush();
    expect(view.host.innerHTML)
      .toBe("<p>Count: 1!</p>");
    expect(scheduler.pending)
      .toBe(0);
  });

  test("a signal change schedules the view, and the flush updates the text", () => {
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    scheduler.flush();

    view.component.count.set(2);
    expect(scheduler.pending)
      .toBe(1);
    expect(view.host.textContent)
      .toBe("1");
    scheduler.flush();
    expect(view.host.textContent)
      .toBe("2");
  });

  test("only texts whose value changed are written", async () => {
    @Component({ selector: "tk-a", template: "<p>{{ a() }}</p><p>{{ b() }}</p>" })
    class A {
      a = signal("a");
      b = signal("b");
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    scheduler.flush();
    const [first, second] = [...view.host.querySelectorAll("p")].map((p) => p.firstChild as Text);
    const writes: string[] = [];
    new MutationObserver((records) => writes.push(...records.map((r) => r.target.textContent!)))
      .observe(
        view.host,
        { characterData: true, subtree: true },
      );

    view.component.b.set("B");
    scheduler.flush();

    await tick();

    expect(first!.data)
      .toBe("a");
    expect(second!.data)
      .toBe("B");
    return Promise.resolve()
      .then(() => expect(writes)
        .toEqual(["B"]));
  });

  test("text without {{ }} is static, and plain fields are read once", async () => {
    @Component({ selector: "tk-a", template: "<p>static</p><p>{{ title }}</p>" })
    class A {
      title = "Tinker";
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    scheduler.flush();
    view.component.title = "changed";
    await tick();
    expect(scheduler.pending)
      .toBe(0);
    expect(view.host.innerHTML)
      .toBe("<p>static</p><p>Tinker</p>");
  });

  test("a component input bound with setInput updates the template", async () => {
    @Component({ selector: "tk-card", template: "<h1>{{ title() }}</h1>" })
    class Card {
      readonly title = input("untitled");
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(Card));
    scheduler.flush();
    await tick();
    expect(view.host.textContent)
      .toBe("untitled");
    view.setInput("title", "Hello");
    scheduler.flush();
    expect(view.host.textContent)
      .toBe("Hello");
  });

  test("an error in the first render is thrown by the flush", () => {
    @Component({ selector: "tk-card", template: "<h1>{{ title() }}</h1><p>{{ count() }}</p>" })
    class Card {
      readonly title = input<string>();
      count = signal(0);
    }
    const { factory, scheduler } = makeFactory();
    const host = document.createElement("div");
    factory.create(Card, host);

    expect(() => scheduler.flush())
      .toThrow(`Input "title" of Card was read before it was bound`);
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
    const view = valueOrThrow(factory.create(A));
    scheduler.flush();
    view.component.fail.set(true);
    expect(() => scheduler.flush())
      .toThrow("boom");
    view.component.fail.set(false);
    scheduler.flush();
    expect(view.host.textContent)
      .toBe("ok");
  });

  test("a destroyed view no longer updates", async () => {
    @Component({ selector: "tk-a", template: "<p>{{ count() }}</p>" })
    class A {
      count = signal(1);
    }
    const { factory, scheduler } = makeFactory();
    const view = valueOrThrow(factory.create(A));
    scheduler.flush();
    view.destroy();
    view.component.count.set(2);
    await tick();
    expect(scheduler.pending)
      .toBe(0);
  });

  test("reports a syntax error in the template before rendering anything", () => {
    @Component({ selector: "tk-a", template: "<p a=></p>" })
    class A {}
    const { factory } = makeFactory();
    const host = document.createElement("div");
    expect(() => factory.create(A, host))
      .toThrow("1:6: expected an attribute value");
    expect(host.innerHTML)
      .toBe("");
  });

  test("reports an invalid {{ }} before rendering anything", () => {
    @Component({ selector: "tk-a", template: "<p>{{ a(1 2) }}</p>" })
    class A {}
    const { factory } = makeFactory();
    const host = document.createElement("div");
    expect(() => factory.create(A, host))
      .toThrow(`Expected "," or ")", found "2"`);
    expect(host.innerHTML)
      .toBe("");
  });
});

describe("ComponentFactory collaborators", () => {
  test("creates views through the injected ComponentViewFactory", async () => {
    @Component({ selector: "tk-a", template: "<p>a</p>" })
    class A {}
    const created: unknown[] = [];
    class RecordingViewFactory extends ComponentViewFactory {
      override create<T>(host: Element, component: T, nodes: readonly Node[]): ComponentView<T> {
        created.push(component);
        return super.create(host, component, nodes, {});
      }
    }
    const { factory } = makeFactory([
      provide(ComponentViewFactory, { useClass: RecordingViewFactory }),
    ]);

    const view = valueOrThrow(factory.create(A));

    await tick();

    expect(created)
      .toEqual([view.component]);
  });
});

describe("the owner of a component's view", () => {
  @Component({ selector: "tk-owned", template: "<p>x</p>" })
  class Owned {}

  test("a root component has no owner", async () => {
    const { factory } = makeFactory();
    const view = valueOrThrow(factory.create(Owned, document.createElement("div")));
    await tick();
    expect(view.node.owner)
      .toBeUndefined();
  });

  test("a component created with an owner is owned by that node", async () => {
    const { factory } = makeFactory();
    const owner: ViewNode = {};
    const view = valueOrThrow(factory.create(Owned, document.createElement("div"), undefined, undefined, owner));
    await tick();
    expect(view.node.owner)
      .toBe(owner);
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { tick } from "./test-support.ts";
import { Component, Directive } from "./authoring/decorators.ts";
import { Effects } from "./authoring/effects.ts";
import { RenderHookRegistry } from "./runtime/render-hook-registry.ts";
import { ElementContext } from "./runtime/element-context.ts";

import type { Class } from "../../utils/types.ts";
import { Engine } from "./engine.ts";
import { DomRenderer } from "./renderer.ts";
import { signal } from "../../signals/index.ts";
import { TinkerTemplateParser } from "./template/tinker-parser.ts";
import { CLASS_REPLACEMENTS, DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import { type ViewContainerRef, ViewContainerRefFactory } from "./runtime/view-container-ref.ts";
import { inject, InjectionToken, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { ChangeDetection } from "./runtime/change-detection.ts";
import { EffectScheduler } from "./runtime/schedulers/effect-scheduler.ts";
import { Ticker } from "./runtime/ticker.ts";
import { ViewScheduler } from "./runtime/schedulers/view-scheduler.ts";

/** A ChangeDetection of its own, from an injector, to hand to an engine and inspect. */
function changeDetection(): ChangeDetection {
  const { injector } = Injector.create({
    providers: [Ticker, EffectScheduler, ViewScheduler, RenderHookRegistry, ChangeDetection],
  });
  return runInInjectionContext(injector, () => inject(ChangeDetection));
}
import { ComponentRef } from "./component-ref.ts";
import type { ComponentView } from "./runtime/component-view.ts";
import { Maybe } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Engine.create", () => {
  test("an engine can only be created through Engine.create()", () => {
    expect(() => new Engine())
      .toThrow("inject() must be called in an injection context");
    expect(Engine.create())
      .toBeInstanceOf(Engine);
  });

  test("each engine has its own root injector and services", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const view = Engine.create()
      .bootstrap(App);
    await tick();
    expect(Engine.create()
      .getContext(view.host.nativeElement)
      .isNone())
      .toBe(true);
  });
});

describe("Engine.bootstrap", () => {
  test("renders the root component into its host element", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({
      selector: "tk-app",
      template: `<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`,
    })
    class App {}

    const ref = Engine.create()
      .bootstrap(App);

    await tick();

    expect(ref.host.nativeElement)
      .toBe(document.querySelector("tk-app"));
    expect(ref.host.nativeElement.innerHTML)
      .toBe(`<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`);
  });

  test("creates the component instance", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {
      title = "Tinker";
    }

    const ref = Engine.create()
      .bootstrap(App);

    await tick();

    expect(ref.instance)
      .toBeInstanceOf(App);
    expect(ref.instance.title)
      .toBe("Tinker");
  });

  test("finds the host with any selector, e.g. an attribute", async () => {
    document.body.innerHTML = `<div id="x" app-root></div>`;
    @Component({ selector: "[app-root]", template: "<p>hi</p>" })
    class App {}

    await tick();

    expect(Engine.create()
      .bootstrap(App).host.nativeElement.id)
      .toBe("x");
  });

  test("renders {{ }} with the component's values, and updates them", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>{{ count() }} {{ label }}</p>" })
    class App {
      count = signal(1);
      label = "clicks";
    }

    const view = Engine.create()
      .bootstrap(App);
    await tick();
    expect(view.host.nativeElement.textContent)
      .toBe("1 clicks");
    view.instance.count.set(2);
    await Promise.resolve(); // the scheduler flushes in a microtask
    expect(view.host.nativeElement.textContent)
      .toBe("2 clicks");
  });

  test("destroy removes what was rendered, and only that", async () => {
    document.body.innerHTML = "<tk-app><span>existing</span></tk-app>";
    @Component({ selector: "tk-app", template: "<p>a</p><p>b</p>" })
    class App {}

    const ref = Engine.create()
      .bootstrap(App);
    await tick();
    expect(ref.host.nativeElement.children)
      .toHaveLength(3);
    ref.destroy();
    ref.destroy();
    expect(ref.host.nativeElement.innerHTML)
      .toBe("<span>existing</span>");
  });

  test("parses each component's template only once", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const parser = new TinkerTemplateParser();
    const parse = vi.spyOn(parser, "parse");
    const engine = Engine.create({ providers: [provide(TEMPLATE_PARSER, { useValue: parser })] });

    engine.bootstrap(App)
      .destroy();
    engine.bootstrap(App);

    await tick();

    expect(parse)
      .toHaveBeenCalledOnce();
    expect(document.querySelector("tk-app")!.innerHTML)
      .toBe("<p>hi</p>");
  });

  test("providers replace the default document and renderer", async () => {
    const other = document.implementation.createHTMLDocument("other");
    other.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>other</p>" })
    class App {}
    const renderer = new DomRenderer(other);
    const createElement = vi.spyOn(renderer, "createElement");

    const ref = Engine.create({
      providers: [
        provide(DOCUMENT, { useValue: other }),
        provide(RENDERER, { useValue: renderer }),
      ],
    })
      .bootstrap(App);

    await tick();

    expect(ref.host.nativeElement.ownerDocument)
      .toBe(other);
    expect(createElement)
      .toHaveBeenCalledWith("p");
  });

  test("returns a ComponentView and remembers it for its host element", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const view = engine.bootstrap(App);

    await tick();

    expect(view)
      .toBeInstanceOf(ComponentRef);
    expect(view.host.nativeElement.childNodes)
      .toHaveLength(1);
    const context = engine.getContext(view.host.nativeElement)
      .getOrElse(undefined)!;
    expect(context)
      .toBeInstanceOf(ElementContext);
    expect(Maybe.map(context.componentView, (componentView) => componentView.host)
      .getOrElse(undefined))
      .toBe(view.host.nativeElement);
    expect(context.directives)
      .toEqual([]);
    expect(engine.getContext(document.body)
      .isNone())
      .toBe(true);
  });

  test("keeps the host's context while directives remain on it", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const engine = Engine.create();
    const view = engine.bootstrap(App);
    const context = engine.getContext(view.host.nativeElement)
      .getOrElse(undefined)!;
    context.addDirective({ name: "some directive" });

    view.destroy();

    await tick();

    expect(engine.getContext(view.host.nativeElement)
      .getOrElse(undefined))
      .toBe(context);
    expect(context.componentView.isNone())
      .toBe(true);
  });

  test("forgets the view when it is destroyed, so the host can be used again", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const first = engine.bootstrap(App);
    first.destroy();
    await tick();
    expect(engine.getContext(first.host.nativeElement)
      .isNone())
      .toBe(true);

    const second = engine.bootstrap(App);
    expect(Maybe.map(
      Maybe.flatMap(
        engine.getContext(second.host.nativeElement),
        (context) => context.componentView,
      ),
      (componentView) => componentView.host,
    )
      .getOrElse(undefined))
      .toBe(second.host.nativeElement);
  });

  test("throws when the host already holds a component", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();
    engine.bootstrap(App);

    expect(() => engine.bootstrap(App))
      .toThrow(
        "The host element of App already holds a component",
      );
    expect(document.querySelector("tk-app")!.innerHTML)
      .toBe("<p>hi</p>");
  });

  test("two engines keep separate views", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const one = Engine.create();
    const view = one.bootstrap(App);

    await tick();

    expect(Engine.create()
      .getContext(view.host.nativeElement)
      .isNone())
      .toBe(true);
  });

  test("createComponent renders into a given host", async () => {
    const host = document.createElement("section");
    @Component({ selector: "tk-x", template: "<p>x</p>" })
    class X {}
    const engine = Engine.create();

    const view = engine.createComponent(X, host);

    await tick();

    expect(view.host.nativeElement)
      .toBe(host);
    expect(host.innerHTML)
      .toBe("<p>x</p>");
    expect(Maybe.map(
      Maybe.flatMap(engine.getContext(host), (context) => context.componentView),
      (componentView) => componentView.host,
    )
      .getOrElse(undefined))
      .toBe(view.host.nativeElement);
  });

  test("createComponent without a host creates one from the selector", async () => {
    @Component({ selector: "tk-tag", template: "" })
    class Tag {}
    @Component({ selector: "[attr-only]", template: "" })
    class AttrOnly {}
    @Component({ selector: "tk-both[extra]", template: "" })
    class Both {}
    const engine = Engine.create();

    await tick();

    expect(engine.createComponent(Tag).host.nativeElement.outerHTML)
      .toBe("<tk-tag></tk-tag>");
    expect(engine.createComponent(AttrOnly).host.nativeElement.outerHTML)
      .toBe(`<div attr-only=""></div>`);
    expect(engine.createComponent(Both).host.nativeElement.outerHTML)
      .toBe(`<tk-both extra=""></tk-both>`);
    expect(engine.createComponent(Tag).host.nativeElement.isConnected)
      .toBe(false);
  });

  test("createComponent throws for a selector it cannot build a host from", () => {
    @Component({ selector: ".a-class", template: "" })
    class ByClass {}
    @Component({ selector: "", template: "" })
    class Empty {}
    const engine = Engine.create();

    expect(() => engine.createComponent(ByClass))
      .toThrow(
        `Cannot create a host element for ByClass from selector ".a-class"`,
      );
    expect(() => engine.createComponent(Empty))
      .toThrow(`from selector ""`);
  });

  test("throws for a class that is not a component", () => {
    @Directive({ selector: "[x]" })
    class NotAComponent {}

    expect(() => Engine.create()
      .bootstrap(NotAComponent))
      .toThrow(
        "NotAComponent is not a component: decorate it with @Component",
      );
  });

  test("throws when no host element matches the selector", () => {
    @Component({ selector: "tk-missing", template: "" })
    class Missing {}

    expect(() => Engine.create()
      .bootstrap(Missing))
      .toThrow(
        `No host element matches "tk-missing" for Missing`,
      );
  });

  test("throws for binding syntax, which is not supported yet", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: `<button [a.b.c]="c">go</button>` })
    class App {}

    expect(() => Engine.create()
      .bootstrap(App))
      .toThrow(
        `Bindings are not supported yet: "[a.b.c]" on <button>`,
      );
    expect(document.querySelector("tk-app")!.innerHTML)
      .toBe("");
  });
});

describe("Engine view updates", () => {
  test("flush runs the pending view updates now", async () => {
    @Component({ selector: "tk-a", template: "{{ count() }}" })
    class A {
      count = signal(1);
    }
    const detection = changeDetection();
    const engine = Engine.create({
      providers: [provide(ChangeDetection, { useValue: detection })],
    });
    const view = engine.createComponent(A);
    engine.flush();
    view.instance.count.set(2);
    expect(detection.views.pending)
      .toBe(1);
    engine.flush();
    expect(detection.views.pending)
      .toBe(0);
    expect(view.host.nativeElement.textContent)
      .toBe("2");
  });

  test("each engine has its own change detection", async () => {
    @Component({ selector: "tk-a", template: "{{ count() }}" })
    class A {
      count = signal(1);
    }
    const one = changeDetection();
    const two = changeDetection();
    const engine = Engine.create({ providers: [provide(ChangeDetection, { useValue: one })] });
    const view = engine.createComponent(A);
    engine.flush();
    Engine.create({ providers: [provide(ChangeDetection, { useValue: two })] });
    view.instance.count.set(2);
    expect(one.views.pending)
      .toBe(1);
    expect(two.views.pending)
      .toBe(0);
  });
});

describe("Engine collaborators", () => {
  test("createViewContainer uses the injected ViewContainerRefFactory", async () => {
    const anchor = document.createComment("anchor");
    const anchors: Node[] = [];
    class RecordingContainers extends ViewContainerRefFactory {
      override create(
        node: Node,
        parentInjector: Injector,
        owner?: ComponentView<unknown>,
      ): ViewContainerRef {
        anchors.push(node);
        return super.create(node, parentInjector, owner);
      }
    }
    const engine = Engine.create({
      providers: [provide(ViewContainerRefFactory, { useClass: RecordingContainers })],
    });

    const container = engine.createViewContainer(anchor);

    await tick();

    expect(anchors)
      .toEqual([anchor]);
    expect(container.anchor)
      .toBe(anchor);
  });
});

describe("Engine.get", () => {
  test("returns a service of the engine's root injector, providers first", async () => {
    const GREETING = new InjectionToken<string>("GREETING");
    const engine = Engine.create({
      providers: [provide(GREETING, { useValue: "given" })],
    });
    await tick();
    expect(engine.get(GREETING))
      .toBe("given");
  });
});

describe("CLASS_REPLACEMENTS", () => {
  test("a template gets the replacement of an imported class", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Directive({ selector: "[mark]" })
    class Real {}
    @Directive({ selector: "[mark]" })
    class Stub {}
    @Component({ selector: "tk-app", template: "<p mark></p>", imports: [Real] })
    class App {}
    const replacements = new Map<Class<object>, Class<object>>([[Real, Stub]]);
    const engine = Engine.create({
      providers: [provide(CLASS_REPLACEMENTS, { useValue: replacements })],
    });
    engine.bootstrap(App);
    const context = engine.getContext(document.querySelector("p")!)
      .getOrElse(undefined)!;
    await tick();
    expect(context.directives[0])
      .toBeInstanceOf(Stub);
  });
});

describe("Engine.bootstrap renders on the next tick", () => {
  test("the text is written on the next tick, not when it is bootstrapped", async () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>{{ text() }}</p>" })
    class App {
      readonly text = signal("first");
    }
    const engine = Engine.create();
    engine.bootstrap(App);
    expect(document.querySelector("p")?.textContent)
      .toBe("");
    engine.flush();
    expect(document.querySelector("p")?.textContent)
      .toBe("first");
  });
});

describe("a failed first render", () => {
  test("stays in place, and the view renders again when its signals change", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>{{ value() }}</p>" })
    class App {
      readonly fail = signal(true);
      readonly value = (): string => {
        if (this.fail()) {
          throw new Error("not yet");
        }
        return "ok";
      };
    }
    const engine = Engine.create();
    const app = engine.bootstrap(App);
    expect(() => engine.flush())
      .toThrow("not yet");
    expect(document.querySelector("tk-app p"))
      .not.toBeNull();
    app.instance.fail.set(false);
    engine.flush();
    expect(document.querySelector("tk-app p")?.textContent)
      .toBe("ok");
    engine.destroy();
  });
});

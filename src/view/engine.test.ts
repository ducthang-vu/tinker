import { afterEach, describe, expect, test, vi } from "vitest";
import { Component, Directive } from "./authoring/decorators.ts";
import { Effects } from "./authoring/effects.ts";
import { RenderHookRegistry } from "./runtime/render-hook-registry.ts";
import { ElementContext } from "./runtime/element-context.ts";
import { Engine } from "./engine.ts";
import { DomRenderer } from "./renderer.ts";
import { signal } from "../signals/index.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import { type ViewContainerRef, ViewContainerRefFactory } from "./runtime/view-container-ref.ts";
import { inject, Injector, provide, runInInjectionContext } from "../di/index.ts";
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
import { View } from "./runtime/view.ts";

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

  test("each engine has its own root injector and services", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const view = Engine.create()
      .bootstrap(App);
    expect(Engine.create()
      .getContext(view.host)
      .isNone())
      .toBe(true);
  });
});

describe("Engine.bootstrap", () => {
  test("renders the root component into its host element", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({
      selector: "tk-app",
      template: `<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`,
    })
    class App {}

    const ref = Engine.create()
      .bootstrap(App);

    expect(ref.host)
      .toBe(document.querySelector("tk-app"));
    expect(ref.host.innerHTML)
      .toBe(`<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`);
  });

  test("creates the component instance", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {
      title = "Tinker";
    }

    const ref = Engine.create()
      .bootstrap(App);

    expect(ref.component)
      .toBeInstanceOf(App);
    expect(ref.component.title)
      .toBe("Tinker");
  });

  test("finds the host with any selector, e.g. an attribute", () => {
    document.body.innerHTML = `<div id="x" app-root></div>`;
    @Component({ selector: "[app-root]", template: "<p>hi</p>" })
    class App {}

    expect(Engine.create()
      .bootstrap(App).host.id)
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
    expect(view.host.textContent)
      .toBe("1 clicks");
    view.component.count.set(2);
    await Promise.resolve(); // the scheduler flushes in a microtask
    expect(view.host.textContent)
      .toBe("2 clicks");
  });

  test("destroy removes what was rendered, and only that", () => {
    document.body.innerHTML = "<tk-app><span>existing</span></tk-app>";
    @Component({ selector: "tk-app", template: "<p>a</p><p>b</p>" })
    class App {}

    const ref = Engine.create()
      .bootstrap(App);
    expect(ref.host.children)
      .toHaveLength(3);
    ref.destroy();
    ref.destroy();
    expect(ref.host.innerHTML)
      .toBe("<span>existing</span>");
  });

  test("parses each component's template only once", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const parser = new BrowserTemplateParser();
    const parse = vi.spyOn(parser, "parse");
    const engine = Engine.create({ providers: [provide(TEMPLATE_PARSER, { useValue: parser })] });

    engine.bootstrap(App)
      .destroy();
    engine.bootstrap(App);

    expect(parse)
      .toHaveBeenCalledOnce();
    expect(document.querySelector("tk-app")!.innerHTML)
      .toBe("<p>hi</p>");
  });

  test("providers replace the default document and renderer", () => {
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

    expect(ref.host.ownerDocument)
      .toBe(other);
    expect(createElement)
      .toHaveBeenCalledWith("p");
  });

  test("returns a View and remembers it for its host element", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const view = engine.bootstrap(App);

    expect(view)
      .toBeInstanceOf(View);
    expect(view.nodes)
      .toHaveLength(1);
    const context = engine.getContext(view.host)
      .getOrElse(undefined)!;
    expect(context)
      .toBeInstanceOf(ElementContext);
    expect(context.componentView.getOrElse(undefined))
      .toBe(view);
    expect(context.directives)
      .toEqual([]);
    expect(engine.getContext(document.body)
      .isNone())
      .toBe(true);
  });

  test("keeps the host's context while directives remain on it", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const engine = Engine.create();
    const view = engine.bootstrap(App);
    const context = engine.getContext(view.host)
      .getOrElse(undefined)!;
    context.addDirective({ name: "some directive" });

    view.destroy();

    expect(engine.getContext(view.host)
      .getOrElse(undefined))
      .toBe(context);
    expect(context.componentView.isNone())
      .toBe(true);
  });

  test("forgets the view when it is destroyed, so the host can be used again", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const first = engine.bootstrap(App);
    first.destroy();
    expect(engine.getContext(first.host)
      .isNone())
      .toBe(true);

    const second = engine.bootstrap(App);
    expect(engine.getContext(second.host)
      .flatMap((context) => context.componentView)
      .getOrElse(undefined))
      .toBe(second);
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

  test("two engines keep separate views", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const one = Engine.create();
    const view = one.bootstrap(App);

    expect(Engine.create()
      .getContext(view.host)
      .isNone())
      .toBe(true);
  });

  test("createComponent renders into a given host", () => {
    const host = document.createElement("section");
    @Component({ selector: "tk-x", template: "<p>x</p>" })
    class X {}
    const engine = Engine.create();

    const view = engine.createComponent(X, host);

    expect(view.host)
      .toBe(host);
    expect(host.innerHTML)
      .toBe("<p>x</p>");
    expect(engine.getContext(host)
      .flatMap((context) => context.componentView)
      .getOrElse(undefined))
      .toBe(view);
  });

  test("createComponent without a host creates one from the selector", () => {
    @Component({ selector: "tk-tag", template: "" })
    class Tag {}
    @Component({ selector: "[attr-only]", template: "" })
    class AttrOnly {}
    @Component({ selector: "tk-both[extra]", template: "" })
    class Both {}
    const engine = Engine.create();

    expect(engine.createComponent(Tag).host.outerHTML)
      .toBe("<tk-tag></tk-tag>");
    expect(engine.createComponent(AttrOnly).host.outerHTML)
      .toBe(`<div attr-only=""></div>`);
    expect(engine.createComponent(Both).host.outerHTML)
      .toBe(`<tk-both extra=""></tk-both>`);
    expect(engine.createComponent(Tag).host.isConnected)
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
    @Component({ selector: "tk-app", template: `<button (click)="go()">go</button>` })
    class App {}

    expect(() => Engine.create()
      .bootstrap(App))
      .toThrow(
        `Bindings are not supported yet: "(click)" on <button>`,
      );
    expect(document.querySelector("tk-app")!.innerHTML)
      .toBe("");
  });
});

describe("Engine view updates", () => {
  test("flush runs the pending view updates now", () => {
    @Component({ selector: "tk-a", template: "{{ count() }}" })
    class A {
      count = signal(1);
    }
    const detection = changeDetection();
    const engine = Engine.create({
      providers: [provide(ChangeDetection, { useValue: detection })],
    });
    const view = engine.createComponent(A);
    view.component.count.set(2);
    expect(detection.views.pending)
      .toBe(1);
    engine.flush();
    expect(detection.views.pending)
      .toBe(0);
    expect(view.host.textContent)
      .toBe("2");
  });

  test("each engine has its own change detection", () => {
    @Component({ selector: "tk-a", template: "{{ count() }}" })
    class A {
      count = signal(1);
    }
    const one = changeDetection();
    const two = changeDetection();
    const view = Engine.create({ providers: [provide(ChangeDetection, { useValue: one })] })
      .createComponent(A);
    Engine.create({ providers: [provide(ChangeDetection, { useValue: two })] });
    view.component.count.set(2);
    expect(one.views.pending)
      .toBe(1);
    expect(two.views.pending)
      .toBe(0);
  });
});

describe("Engine collaborators", () => {
  test("createViewContainer uses the injected ViewContainerRefFactory", () => {
    const anchor = document.createComment("anchor");
    const anchors: Node[] = [];
    class RecordingContainers extends ViewContainerRefFactory {
      override create(node: Node): ViewContainerRef {
        anchors.push(node);
        return super.create(node);
      }
    }
    const engine = Engine.create({
      providers: [provide(ViewContainerRefFactory, { useClass: RecordingContainers })],
    });

    const container = engine.createViewContainer(anchor);

    expect(anchors)
      .toEqual([anchor]);
    expect(container.anchor)
      .toBe(anchor);
  });
});

describe("Engine.afterStable", () => {
  test("completes once the tick ended: effects ran and views rendered", async () => {
    const log: string[] = [];
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

    view.component.count.set(5);
    await engine.afterStable()
      .toPromise();
    log.push(view.host.textContent!);

    expect(log)
      .toEqual(["10"]);
  });

  test("completes even when nothing changed", async () => {
    await expect(Engine.create()
      .afterStable()
      .toPromise()).resolves.toBeUndefined();
  });

  test("is lazy and cancellable", () => {
    const engine = Engine.create();
    const ended: string[] = [];
    const stable = engine.afterStable();
    engine.flush();
    expect(ended)
      .toEqual([]); // not run yet
    const cancel = stable.run({ ok: () => ended.push("stable") });
    cancel();
    engine.flush();
    expect(ended)
      .toEqual([]);
  });
});

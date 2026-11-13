import { afterEach, describe, expect, test, vi } from "vitest";
import { Component, Directive } from "./decorators.ts";
import { ElementContext } from "./element-context.ts";
import { Engine } from "./engine.ts";
import { DomRenderer } from "./renderer.ts";
import { provide } from "../di/index.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import { ViewScheduler } from "./view-scheduler.ts";
import { View } from "./view.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Engine.create", () => {
  test("an engine can only be created through Engine.create()", () => {
    expect(() => new Engine()).toThrow("inject() must be called in an injection context");
    expect(Engine.create()).toBeInstanceOf(Engine);
  });

  test("each engine has its own root injector and services", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const view = Engine.create().bootstrap(App);
    expect(Engine.create().getContext(view.host)).toBeUndefined();
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

    const ref = Engine.create().bootstrap(App);

    expect(ref.host).toBe(document.querySelector("tk-app"));
    expect(ref.host.innerHTML).toBe(`<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`);
  });

  test("creates the component instance", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {
      title = "Tinker";
    }

    const ref = Engine.create().bootstrap(App);

    expect(ref.component).toBeInstanceOf(App);
    expect(ref.component.title).toBe("Tinker");
  });

  test("finds the host with any selector, e.g. an attribute", () => {
    document.body.innerHTML = `<div id="x" app-root></div>`;
    @Component({ selector: "[app-root]", template: "<p>hi</p>" })
    class App {}

    expect(Engine.create().bootstrap(App).host.id).toBe("x");
  });

  test("renders {{ }} text as written, for now", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>{{ count() }}</p>" })
    class App {}

    expect(Engine.create().bootstrap(App).host.textContent).toBe("{{ count() }}");
  });

  test("destroy removes what was rendered, and only that", () => {
    document.body.innerHTML = "<tk-app><span>existing</span></tk-app>";
    @Component({ selector: "tk-app", template: "<p>a</p><p>b</p>" })
    class App {}

    const ref = Engine.create().bootstrap(App);
    expect(ref.host.children).toHaveLength(3);
    ref.destroy();
    ref.destroy();
    expect(ref.host.innerHTML).toBe("<span>existing</span>");
  });

  test("parses each component's template only once", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const parser = new BrowserTemplateParser();
    const parse = vi.spyOn(parser, "parse");
    const engine = Engine.create({ providers: [provide(TEMPLATE_PARSER, { useValue: parser })] });

    engine.bootstrap(App).destroy();
    engine.bootstrap(App);

    expect(parse).toHaveBeenCalledOnce();
    expect(document.querySelector("tk-app")!.innerHTML).toBe("<p>hi</p>");
  });

  test("providers replace the default document and renderer", () => {
    const other = document.implementation.createHTMLDocument("other");
    other.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>other</p>" })
    class App {}
    const renderer = new DomRenderer(other);
    const createElement = vi.spyOn(renderer, "createElement");

    const ref = Engine.create({
      providers: [provide(DOCUMENT, { useValue: other }), provide(RENDERER, { useValue: renderer })],
    }).bootstrap(App);

    expect(ref.host.ownerDocument).toBe(other);
    expect(createElement).toHaveBeenCalledWith("p");
  });

  test("returns a View and remembers it for its host element", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const view = engine.bootstrap(App);

    expect(view).toBeInstanceOf(View);
    expect(view.nodes).toHaveLength(1);
    const context = engine.getContext(view.host)!;
    expect(context).toBeInstanceOf(ElementContext);
    expect(context.componentView).toBe(view);
    expect(context.directives).toEqual([]);
    expect(engine.getContext(document.body)).toBeUndefined();
  });

  test("keeps the host's context while directives remain on it", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const engine = Engine.create();
    const view = engine.bootstrap(App);
    const context = engine.getContext(view.host)!;
    context.addDirective({ name: "some directive" });

    view.destroy();

    expect(engine.getContext(view.host)).toBe(context);
    expect(context.componentView).toBeUndefined();
  });

  test("forgets the view when it is destroyed, so the host can be used again", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();

    const first = engine.bootstrap(App);
    first.destroy();
    expect(engine.getContext(first.host)).toBeUndefined();

    const second = engine.bootstrap(App);
    expect(engine.getContext(second.host)?.componentView).toBe(second);
  });

  test("throws when the host already holds a component", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = Engine.create();
    engine.bootstrap(App);

    expect(() => engine.bootstrap(App)).toThrow(
      "The host element of App already holds a component",
    );
    expect(document.querySelector("tk-app")!.innerHTML).toBe("<p>hi</p>");
  });

  test("two engines keep separate views", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {}
    const one = Engine.create();
    const view = one.bootstrap(App);

    expect(Engine.create().getContext(view.host)).toBeUndefined();
  });

  test("createComponent renders into a given host", () => {
    const host = document.createElement("section");
    @Component({ selector: "tk-x", template: "<p>x</p>" })
    class X {}
    const engine = Engine.create();

    const view = engine.createComponent(X, host);

    expect(view.host).toBe(host);
    expect(host.innerHTML).toBe("<p>x</p>");
    expect(engine.getContext(host)?.componentView).toBe(view);
  });

  test("createComponent without a host creates one from the selector", () => {
    @Component({ selector: "tk-tag", template: "" })
    class Tag {}
    @Component({ selector: "[attr-only]", template: "" })
    class AttrOnly {}
    @Component({ selector: "tk-both[extra]", template: "" })
    class Both {}
    const engine = Engine.create();

    expect(engine.createComponent(Tag).host.outerHTML).toBe("<tk-tag></tk-tag>");
    expect(engine.createComponent(AttrOnly).host.outerHTML).toBe(`<div attr-only=""></div>`);
    expect(engine.createComponent(Both).host.outerHTML).toBe(`<tk-both extra=""></tk-both>`);
    expect(engine.createComponent(Tag).host.isConnected).toBe(false);
  });

  test("createComponent throws for a selector it cannot build a host from", () => {
    @Component({ selector: ".a-class", template: "" })
    class ByClass {}
    @Component({ selector: "", template: "" })
    class Empty {}
    const engine = Engine.create();

    expect(() => engine.createComponent(ByClass)).toThrow(
      `Cannot create a host element for ByClass from selector ".a-class"`,
    );
    expect(() => engine.createComponent(Empty)).toThrow(`from selector ""`);
  });

  test("throws for a class that is not a component", () => {
    @Directive({ selector: "[x]" })
    class NotAComponent {}

    expect(() => Engine.create().bootstrap(NotAComponent)).toThrow(
      "NotAComponent is not a component: decorate it with @Component",
    );
  });

  test("throws when no host element matches the selector", () => {
    @Component({ selector: "tk-missing", template: "" })
    class Missing {}

    expect(() => Engine.create().bootstrap(Missing)).toThrow(
      `No host element matches "tk-missing" for Missing`,
    );
  });

  test("throws for binding syntax, which is not supported yet", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: `<button (click)="go()">go</button>` })
    class App {}

    expect(() => Engine.create().bootstrap(App)).toThrow(
      `Bindings are not supported yet: "(click)" on <button>`,
    );
    expect(document.querySelector("tk-app")!.innerHTML).toBe("");
  });
});

describe("Engine view updates", () => {
  test("flush runs the pending view updates now", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const scheduler = new ViewScheduler();
    const engine = Engine.create({ providers: [provide(ViewScheduler, { useValue: scheduler })] });
    engine.createComponent(A);
    expect(scheduler.pending).toBe(1);
    engine.flush();
    expect(scheduler.pending).toBe(0);
  });

  test("each engine has its own scheduler", () => {
    @Component({ selector: "tk-a", template: "" })
    class A {}
    const one = new ViewScheduler();
    const two = new ViewScheduler();
    Engine.create({ providers: [provide(ViewScheduler, { useValue: one })] }).createComponent(A);
    expect(one.pending).toBe(1);
    expect(two.pending).toBe(0);
  });
});

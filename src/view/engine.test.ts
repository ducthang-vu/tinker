import { afterEach, describe, expect, test, vi } from "vitest";
import { Component, Directive } from "./decorators.ts";
import { ElementContext } from "./element-context.ts";
import { Engine } from "./engine.ts";
import { DomRenderer } from "./renderer.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import { View } from "./view.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Engine.bootstrap", () => {
  test("renders the root component into its host element", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({
      selector: "tk-app",
      template: `<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`,
    })
    class App {}

    const ref = new Engine().bootstrap(App);

    expect(ref.host).toBe(document.querySelector("tk-app"));
    expect(ref.host.innerHTML).toBe(`<h1 class="title">Hello</h1><p>from <b>Tinker</b></p>`);
  });

  test("creates the component instance", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "" })
    class App {
      title = "Tinker";
    }

    const ref = new Engine().bootstrap(App);

    expect(ref.component).toBeInstanceOf(App);
    expect(ref.component.title).toBe("Tinker");
  });

  test("finds the host with any selector, e.g. an attribute", () => {
    document.body.innerHTML = `<div id="x" app-root></div>`;
    @Component({ selector: "[app-root]", template: "<p>hi</p>" })
    class App {}

    expect(new Engine().bootstrap(App).host.id).toBe("x");
  });

  test("renders {{ }} text as written, for now", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>{{ count() }}</p>" })
    class App {}

    expect(new Engine().bootstrap(App).host.textContent).toBe("{{ count() }}");
  });

  test("destroy removes what was rendered, and only that", () => {
    document.body.innerHTML = "<tk-app><span>existing</span></tk-app>";
    @Component({ selector: "tk-app", template: "<p>a</p><p>b</p>" })
    class App {}

    const ref = new Engine().bootstrap(App);
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
    const engine = new Engine({ parser });

    engine.bootstrap(App).destroy();
    engine.bootstrap(App);

    expect(parse).toHaveBeenCalledOnce();
    expect(document.querySelector("tk-app")!.innerHTML).toBe("<p>hi</p>");
  });

  test("uses the document, parser and renderer it is given", () => {
    const other = document.implementation.createHTMLDocument("other");
    other.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>other</p>" })
    class App {}
    const renderer = new DomRenderer(other);
    const createElement = vi.spyOn(renderer, "createElement");

    const ref = new Engine({ document: other, renderer }).bootstrap(App);

    expect(ref.host.ownerDocument).toBe(other);
    expect(createElement).toHaveBeenCalledWith("p");
  });

  test("returns a View and remembers it for its host element", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: "<p>hi</p>" })
    class App {}
    const engine = new Engine();

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
    const engine = new Engine();
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
    const engine = new Engine();

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
    const engine = new Engine();
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
    const one = new Engine();
    const view = one.bootstrap(App);

    expect(new Engine().getContext(view.host)).toBeUndefined();
  });

  test("createComponent renders into a given host", () => {
    const host = document.createElement("section");
    @Component({ selector: "tk-x", template: "<p>x</p>" })
    class X {}
    const engine = new Engine();

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
    const engine = new Engine();

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
    const engine = new Engine();

    expect(() => engine.createComponent(ByClass)).toThrow(
      `Cannot create a host element for ByClass from selector ".a-class"`,
    );
    expect(() => engine.createComponent(Empty)).toThrow(`from selector ""`);
  });

  test("throws for a class that is not a component", () => {
    @Directive({ selector: "[x]" })
    class NotAComponent {}

    expect(() => new Engine().bootstrap(NotAComponent)).toThrow(
      "NotAComponent is not a component: decorate it with @Component",
    );
  });

  test("throws when no host element matches the selector", () => {
    @Component({ selector: "tk-missing", template: "" })
    class Missing {}

    expect(() => new Engine().bootstrap(Missing)).toThrow(
      `No host element matches "tk-missing" for Missing`,
    );
  });

  test("throws for binding syntax, which is not supported yet", () => {
    document.body.innerHTML = "<tk-app></tk-app>";
    @Component({ selector: "tk-app", template: `<button (click)="go()">go</button>` })
    class App {}

    expect(() => new Engine().bootstrap(App)).toThrow(
      `Bindings are not supported yet: "(click)" on <button>`,
    );
    expect(document.querySelector("tk-app")!.innerHTML).toBe("");
  });
});

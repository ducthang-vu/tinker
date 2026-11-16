import { describe, expect, test } from "vitest";
import { Injector, inject } from "../../../di/index.ts";
import { computed, signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";
import { BrowserTemplateParser } from "../template/browser-parser.ts";
import { type CompiledNode, compileTemplate, type DirectiveCandidate } from "../template/compile.ts";
import { Scope } from "../template/scope.ts";
import { Selector } from "../template/selector.ts";
import { EmbeddedViewFactory } from "./embedded-view-factory.ts";

let factory!: EmbeddedViewFactory;
let injector!: Injector;

@Component({ selector: "tk-owner", template: "" })
class Owner {
  readonly text = signal("first");
  readonly embedded = inject(EmbeddedViewFactory);
  readonly own = inject(Injector);

  constructor() {
    factory = this.embedded;
    injector = this.own;
  }
}

@Component({ selector: "tk-child", template: "<b>x</b>" })
class Child {}

function compile(source: string, candidates: readonly DirectiveCandidate[] = []): CompiledNode[] {
  return [...compileTemplate(new BrowserTemplateParser(document)
    .parse(source), candidates)];
}

function setup() {
  const app = bootstrap(Owner, { host: document.createElement("section") });
  const host = document.createElement("section");
  const anchor = document.createComment("anchor");
  host.append(anchor);
  return { owner: app.root.instance, host, anchor, app };
}

describe("EmbeddedViewFactory", () => {
  test("renders the children just before the anchor, in order", () => {
    const { owner, host, anchor, app } = setup();
    factory.create(owner, compile("<p>a</p><p>b</p>"), new Scope(owner), anchor, injector);
    expect(host.innerHTML)
      .toBe("<p>a</p><p>b</p><!--anchor-->");
    app.destroy();
  });

  test("updates by its own watch, when a signal it reads changes", async () => {
    const { owner, host, anchor, app } = setup();
    factory.create(owner, compile("{{ text() }}"), new Scope(owner), anchor, injector);
    expect(host.textContent)
      .toBe("first");
    owner.text.set("second");
    await new Promise((resolve) => setTimeout(resolve));
    expect(host.textContent)
      .toBe("second");
    app.destroy();
  });

  test("reads the @let values of its scope, which shadow the component's names", () => {
    const { owner, host, anchor, app } = setup();
    const scope = new Scope(owner);
    scope.lets.set("label", computed(() => "from a let"));
    factory.create(owner, compile("{{ label }}"), scope, anchor, injector);
    expect(host.textContent)
      .toBe("from a let");
    app.destroy();
  });

  test("creates the components in its children, and destroys them with it", () => {
    const { owner, host, anchor, app } = setup();
    const candidates: DirectiveCandidate[] = [
      { type: Child, selector: Selector.parse("tk-child")
        .getOrThrow(), isComponent: true },
    ];
    const view = factory.create(owner, compile("<tk-child></tk-child>", candidates), new Scope(owner), anchor, injector);
    expect(host.innerHTML)
      .toBe("<tk-child><b>x</b></tk-child><!--anchor-->");
    view.destroy();
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    app.destroy();
  });

  test("destroy removes its nodes, and stops its watch", async () => {
    const { owner, host, anchor, app } = setup();
    const view = factory.create(owner, compile("{{ text() }}"), new Scope(owner), anchor, injector);
    view.destroy();
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    owner.text.set("later");
    await new Promise((resolve) => setTimeout(resolve));
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    view.destroy();
    app.destroy();
  });

  test("an anchor that is not in the DOM is an error", () => {
    const { owner, app } = setup();
    expect(() => factory.create(owner, [], new Scope(owner), document.createComment("loose"), injector))
      .toThrow("The anchor of an embedded view is not in the DOM");
    app.destroy();
  });

  test("an error in the first render is thrown, and nothing is left behind", () => {
    const { owner, host, anchor, app } = setup();
    expect(() => factory.create(owner, compile("{{ missing() }}"), new Scope(owner), anchor, injector))
      .toThrow();
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    app.destroy();
  });
});

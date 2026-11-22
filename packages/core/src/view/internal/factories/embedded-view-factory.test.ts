import { ViewQueries } from "../runtime/view-queries.ts";
import { parseNodes } from "../test-support.ts";
import { tick } from "../test-support.ts";
import { describe, expect, test } from "vitest";
import { Injector, inject } from "../../../di/index.ts";
import { computed, signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";
import { compileTemplate as compileTemplateEither, type DirectiveCandidate } from "../template/compile.ts";

const compileTemplate = (...args: Parameters<typeof compileTemplateEither>) =>
  valueOrThrow(compileTemplateEither(...args));
import { Scope } from "../template/scope.ts";
import { Selector } from "../template/selector.ts";
import { ComponentFactory } from "./component-factory.ts";
import { EmbeddedViewFactory } from "./embedded-view-factory.ts";
import { TemplateBuilderFactory } from "./template-builder.ts";
import type { CompiledNode } from "../template/compile.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

let factory!: EmbeddedViewFactory;
let injector!: Injector;
let builders!: TemplateBuilderFactory;
let components!: ComponentFactory;

function render(owner: object, children: readonly CompiledNode[], scope: Scope, anchor: Node) {
  const queries = new ViewQueries();
  const builder = builders.create(owner, components, queries, scope);
  return factory.create(builder, children, anchor, injector);
}

@Component({ selector: "tk-owner", template: "" })
class Owner {
  readonly text = signal("first");
  readonly embedded = inject(EmbeddedViewFactory);
  readonly own = inject(Injector);
  readonly builderFactory = inject(TemplateBuilderFactory);
  readonly componentFactory = inject(ComponentFactory);

  constructor() {
    factory = this.embedded;
    injector = this.own;
    builders = this.builderFactory;
    components = this.componentFactory;
  }
}

@Component({ selector: "tk-child", template: "<b>x</b>" })
class Child {}

function compile(source: string, candidates: readonly DirectiveCandidate[] = []): CompiledNode[] {
  return [...compileTemplate(parseNodes(source), candidates)];
}

function setup() {
  const app = valueOrThrow(bootstrap(Owner, { host: document.createElement("section") }));
  const host = document.createElement("section");
  const anchor = document.createComment("anchor");
  host.append(anchor);
  return { owner: app.root.instance, host, anchor, app };
}

describe("EmbeddedViewFactory", () => {
  test("renders the children just before the anchor, in order", () => {
    const { owner, host, anchor, app } = setup();
    render(owner, compile("<p>a</p><p>b</p>"), new Scope(owner), anchor);
    expect(host.innerHTML)
      .toBe("<p>a</p><p>b</p><!--anchor-->");
    app.destroy();
  });

  test("updates by its own watch, when a signal it reads changes", async () => {
    const { owner, host, anchor, app } = setup();
    render(owner, compile("{{ text() }}"), new Scope(owner), anchor);
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
    render(owner, compile("{{ label }}"), scope, anchor);
    expect(host.textContent)
      .toBe("from a let");
    app.destroy();
  });

  test("creates the components in its children, and destroys them with it", () => {
    const { owner, host, anchor, app } = setup();
    const candidates: DirectiveCandidate[] = [
      { type: Child, selector: valueOrThrow(Selector.parse("tk-child")), isComponent: true },
    ];
    const view = render(owner, compile("<tk-child></tk-child>", candidates), new Scope(owner), anchor);
    expect(host.innerHTML)
      .toBe("<tk-child><b>x</b></tk-child><!--anchor-->");
    view.destroy();
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    app.destroy();
  });

  test("destroy removes its nodes, and stops its watch", async () => {
    const { owner, host, anchor, app } = setup();
    const view = render(owner, compile("{{ text() }}"), new Scope(owner), anchor);
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
    expect(() => render(owner, [], new Scope(owner), document.createComment("loose")))
      .toThrow("The anchor of an embedded view is not in the DOM");
    app.destroy();
  });

  test("an error in the first render is thrown, and nothing is left behind", () => {
    const { owner, host, anchor, app } = setup();
    expect(() => render(owner, compile("{{ missing() }}"), new Scope(owner), anchor))
      .toThrow();
    expect(host.innerHTML)
      .toBe("<!--anchor-->");
    app.destroy();
  });
});

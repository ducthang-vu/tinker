import { describe, expect, test } from "vitest";
import { provide } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { compileSource } from "../../compiler/compile-source.ts";
import { CLASS_REPLACEMENTS } from "../tokens.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { TEMPLATE_PARSER } from "../tokens.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";
import { renderComponent } from "../test-support.ts";

/** A parser that fails if it is ever used: a precompiled template must not reach it. */
const noParsing = provide(TEMPLATE_PARSER, {
  useValue: {
    parse: () => {
      throw new Error("the parser must not run for a precompiled template");
    },
  },
});

describe("a component with a precompiled template", () => {
  test("renders its tree without parsing or compiling the template", () => {
    const nodes = valueOrThrow(compileSource("<p>{{ name() }}</p>"));
    @Component({ selector: "tk-greet", template: nodes })
    class Greet {
      readonly name = signal("Ada");
    }
    const engine = Engine.create({ providers: [noParsing] });
    const view = valueOrThrow(renderComponent(engine, Greet));
    engine.flush();
    expect(view.host.nativeElement.textContent)
      .toBe("Ada");
  });

  test("creates the directives the tree names", () => {
    let created = 0;
    @Directive({ selector: "[item]" })
    class Item {
      constructor() {
        created += 1;
      }
    }
    const nodes = valueOrThrow(compileSource("<p item>x</p>", [{ selector: "[item]", isComponent: false, type: Item }]));
    @Component({ selector: "tk-list", template: nodes, imports: [Item] })
    class List {}
    const engine = Engine.create({ providers: [noParsing] });
    renderComponent(engine, List);
    engine.flush();
    expect(created)
      .toBe(1);
  });

  test("a string template is still parsed and compiled", () => {
    @Component({ selector: "tk-plain", template: "<p>plain</p>" })
    class Plain {}
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Plain));
    engine.flush();
    expect(view.host.nativeElement.textContent)
      .toBe("plain");
  });
});

describe("CLASS_REPLACEMENTS and a precompiled template", () => {
  test("a class the tree names is replaced, as it is for a string template", () => {
    @Component({ selector: "tk-real", template: "<p>real</p>" })
    class Real {}
    @Component({ selector: "tk-fake", template: "<p>fake</p>" })
    class Fake {}
    const nodes = valueOrThrow(compileSource("<tk-real></tk-real>", [
      { selector: "tk-real", isComponent: true, type: Real },
    ]));
    @Component({ selector: "tk-host", template: nodes, imports: [Real] })
    class Host {}
    const el = document.createElement("section");
    const engine = Engine.create({
      providers: [provide(CLASS_REPLACEMENTS, { useValue: new Map([[Real, Fake]]) })],
    });
    const view = valueOrThrow(engine.bootstrap(Host, el));
    engine.flush();
    expect(el.querySelector("tk-real p")?.textContent)
      .toBe("fake");
    view.destroy();
  });
});

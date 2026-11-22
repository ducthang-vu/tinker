import { describe, expect, test } from "vitest";
import { provide } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { compileSource } from "../../compiler/compile-source.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { TEMPLATE_PARSER } from "../tokens.ts";
import { match, Left, Right } from "@tinker/functional/v1";

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
    const nodes = match(compileSource("<p>{{ name() }}</p>"), { Left: (error) => {
      throw error;
    }, Right: (value) => value });
    @Component({ selector: "tk-greet", template: nodes })
    class Greet {
      readonly name = signal("Ada");
    }
    const engine = Engine.create({ providers: [noParsing] });
    const view = engine.createComponent(Greet);
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
    const nodes = match(compileSource("<p item>x</p>", [{ selector: "[item]", isComponent: false, type: Item }]), { Left: (error) => {
      throw error;
    }, Right: (value) => value });
    @Component({ selector: "tk-list", template: nodes, imports: [Item] })
    class List {}
    const engine = Engine.create({ providers: [noParsing] });
    engine.createComponent(List);
    engine.flush();
    expect(created)
      .toBe(1);
  });

  test("a string template is still parsed and compiled", () => {
    @Component({ selector: "tk-plain", template: "<p>plain</p>" })
    class Plain {}
    const engine = Engine.create();
    const view = engine.createComponent(Plain);
    engine.flush();
    expect(view.host.nativeElement.textContent)
      .toBe("plain");
  });
});

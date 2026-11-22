import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { query } from "../authoring/query.ts";
import { QueryMissingError } from "../authoring/query.ts";
import { Engine } from "../engine.ts";
import { valueOrThrow, isNone, getOrElse } from "@tinker/functional";

@Directive({ selector: "[marker]", exportAs: "marker" })
class Marker {
  readonly id = 3;
}

@Component({ selector: "tk-tagged", template: "<i>tagged</i>" })
class Tagged {
  readonly label = "hi";
}

describe("query with a template variable as the target", () => {
  test("##name is the component the variable names", async () => {
    @Component({
      selector: "tk-a",
      template: `<tk-tagged ##item></tk-tagged>`,
      imports: [Tagged],
    })
    class A {
      readonly item = query<Tagged>("item");
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(A));
    await tick();
    expect(getOrElse(view.instance.item(), undefined))
      .toBeInstanceOf(Tagged);
  });

  test("#name=\"exportAs\" is the directive with that exportAs", () => {
    @Component({
      selector: "tk-b",
      template: `<p marker #m="marker"></p>`,
      imports: [Marker],
    })
    class B {
      readonly m = query.required<Marker>("m");
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(B));
    expect(view.instance.m())
      .toBeInstanceOf(Marker);
  });

  test("#name is the element, and query returns it", async () => {
    @Component({
      selector: "tk-c",
      template: `<p #para>x</p>`,
    })
    class C {
      readonly para = query<HTMLParagraphElement>("para");
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(C));
    await tick();
    expect(getOrElse(view.instance.para(), undefined)?.tagName)
      .toBe("P");
  });

  test("a name declared inside @if is not a target: it is not in the component's registry", async () => {
    @Component({
      selector: "tk-d",
      template: `@if (true) { <p #inner></p> }`,
    })
    class D {
      readonly inner = query("inner");
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(D));
    await tick();
    expect(isNone(view.instance.inner()))
      .toBe(true);
  });

  test("query.required names the query when the variable has no value", () => {
    @Component({
      selector: "tk-e",
      template: `<p>x</p>`,
    })
    class E {
      readonly missing = query.required("missing");
    }
    const view = valueOrThrow(Engine.create()
      .createComponent(E));
    expect(() => view.instance.missing())
      .toThrow(QueryMissingError);
    expect(() => view.instance.missing())
      .toThrow(`No "missing" found, which query.required("missing") needs`);
  });
});

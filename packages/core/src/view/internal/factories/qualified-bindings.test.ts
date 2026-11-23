import { valueOrThrow } from "@tinker/functional";
import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { Engine } from "../engine.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive, output, queryAll } from "../../index.ts";
import { renderComponent } from "../test-support.ts";

@Directive({ selector: "[fires]" })
class Fires {
  readonly fired = output<number>();
}

@Directive({ selector: "[alsoFires]" })
class AlsoFires {
  readonly fired = output<number>();
}

describe("qualified outputs: (owner.name)", () => {
  test("(owner.name) handles the output of that directive only", async () => {
    const seen: number[] = [];
    @Component({
      selector: "tk-two",
      template: "<p fires alsoFires (fires.fired)=\"onFired($event)\"></p>",
      imports: [Fires, AlsoFires],
    })
    class Two {
      readonly fires = queryAll(Fires);
      readonly alsoFires = queryAll(AlsoFires);
      onFired(value: number) {
        seen.push(value);
      }
    }
    const app = bootstrap(Two, { host: document.createElement("section") });
    await tick();
    app.root.instance.alsoFires()[0]!.fired.emit(7);
    expect(seen)
      .toEqual([]);
    app.root.instance.fires()[0]!.fired.emit(3);
    expect(seen)
      .toEqual([3]);
    app.destroy();
  });

  test("an unqualified output that two directives on the element have is an error", () => {
    @Component({
      selector: "tk-ambiguous-output",
      template: "<p fires alsoFires (fired)=\"onFired()\"></p>",
      imports: [Fires, AlsoFires],
    })
    class AmbiguousOutput {
      onFired() {}
    }
    expect(() => valueOrThrow(renderComponent(Engine.create(), AmbiguousOutput)))
      .toThrow("(fired) on <p> would reach fires and alsoFires: write (fires.fired) to choose one");
  });

  test("a qualified output with no directive of that selector, or without that output, is an error", () => {
    @Component({
      selector: "tk-no-owner",
      template: "<p fires (nobody.fired)=\"onFired()\"></p>",
      imports: [Fires],
    })
    class NoOwner {
      onFired() {}
    }
    expect(() => valueOrThrow(renderComponent(Engine.create(), NoOwner)))
      .toThrow("no directive or component has the selector \"nobody\", or a DOM modifier such as .prevent");

    @Component({
      selector: "tk-no-output",
      template: "<p fires (fires.missing)=\"onFired()\"></p>",
      imports: [Fires],
    })
    class NoOutput {
      onFired() {}
    }
    expect(() => valueOrThrow(renderComponent(Engine.create(), NoOutput)))
      .toThrow("\"fires\" has no output \"missing\"");
  });
});

describe("qualified inputs: [owner.name]", () => {
  test("an input whose owner has no selector on the element is an error", () => {
    @Component({
      selector: "tk-no-input-owner",
      template: "<p fires [nobody.label]=\"text\"></p>",
      imports: [Fires],
    })
    class NoInputOwner {
      readonly text = "x";
    }
    expect(() => valueOrThrow(renderComponent(Engine.create(), NoInputOwner)))
      .toThrow("[nobody.label] on <p>: no directive or component has the selector \"nobody\"");
  });
});

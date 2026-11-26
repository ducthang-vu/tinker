import { describe, expect, test } from "vitest";
import { Component } from "./authoring/decorators.ts";
import { signal } from "../../signals/index.ts";
import { Engine } from "./engine.ts";
import { __tinkerHot, type HotModule } from "./hot.ts";
import { renderComponent, tick } from "./test-support.ts";
import { valueOrThrow } from "@tinker/functional";

/** A hot API that records what it is told. */
function hotStub() {
  const log: string[] = [];
  const hot: HotModule = {
    accept: () => {
      log.push("accept");
    },
    invalidate: () => {
      log.push("invalidate");
    },
  };
  return { hot, log };
}

describe("__tinkerHot", () => {
  test("the first load accepts the module", () => {
    const { hot, log } = hotStub();
    class Page {}
    __tinkerHot(hot, "/hot/first-load.ts", "fp", [["Page", Page]]);
    expect(log)
      .toEqual(["accept"]);
  });

  test("a change of the code, other than the templates, reloads the page", () => {
    const { hot, log } = hotStub();
    class Page {}
    __tinkerHot(hot, "/hot/code.ts", "fp-1", [["Page", Page]]);
    __tinkerHot(hot, "/hot/code.ts", "fp-2", [["Page", Page]]);
    expect(log)
      .toEqual(["accept", "invalidate"]);
  });

  test("a template-only change renders the live views again, keeping the instance and its state", async () => {
    const { hot, log } = hotStub();
    @Component({ selector: "tk-first", template: "<p>first {{ n() }}</p>" })
    class First {
      readonly n = signal(1);
    }
    __tinkerHot(hot, "/hot/template.ts", "fp", [["Show", First]]);
    const engine = Engine.create();
    const ref = valueOrThrow(renderComponent(engine, First));
    await tick();
    const instance = ref.instance;
    instance.n.set(3);
    await tick();
    expect(ref.host.nativeElement.querySelector("p")!.textContent)
      .toBe("first 3");

    @Component({ selector: "tk-second", template: "<p>second {{ n() }}</p>" })
    class Second {
      readonly n = signal(0);
    }
    __tinkerHot(hot, "/hot/template.ts", "fp", [["Show", Second]]);
    await tick();
    expect(ref.host.nativeElement.querySelector("p")!.textContent)
      .toBe("second 3");
    expect(ref.instance)
      .toBe(instance);
    expect(log)
      .toEqual(["accept", "accept"]);
  });

  test("a component with a live view in a template cannot be updated in place: the page reloads", async () => {
    const { hot, log } = hotStub();
    @Component({ selector: "tk-child", template: "<p>child</p>" })
    class Child {}
    __tinkerHot(hot, "/hot/child.ts", "fp", [["Child", Child]]);
    @Component({ selector: "tk-parent", template: "<tk-child></tk-child>", imports: [Child] })
    class Parent {}
    valueOrThrow(renderComponent(Engine.create(), Parent));
    await tick();
    __tinkerHot(hot, "/hot/child.ts", "fp", [["Child", Child]]);
    expect(log)
      .toEqual(["accept", "invalidate"]);
  });

  test("after a template-only change, a new instance of the old class renders the new template", async () => {
    const { hot } = hotStub();
    @Component({ selector: "tk-old", template: "<p>old</p>" })
    class Old {}
    __tinkerHot(hot, "/hot/new-instances.ts", "fp", [["Old", Old]]);
    @Component({ selector: "tk-new", template: "<p>new</p>" })
    class Replacement {}
    __tinkerHot(hot, "/hot/new-instances.ts", "fp", [["Old", Replacement]]);
    const ref = valueOrThrow(renderComponent(Engine.create(), Old));
    await tick();
    expect(ref.host.nativeElement.querySelector("p")!.textContent)
      .toBe("new");
    expect(ref.instance)
      .toBeInstanceOf(Replacement);
  });
});

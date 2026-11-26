import { afterEach, describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import { signal } from "../../../signals/index.ts";
import { Engine } from "../engine.ts";
import { renderComponent, tick } from "../test-support.ts";
import type { Class } from "../../../utils/types.ts";
import { flatMap, getOrThrow, valueOrThrow } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The view of the component rendered into `host`, through the engine. */
function viewOf<T>(engine: Engine, host: Element): ComponentView<T> {
  return getOrThrow(
    flatMap(engine.getContext(host), (context) => context.componentView),
    () => new Error("no component on the element"),
  ) as ComponentView<T>;
}

/** Render `type` as a root component: its reference, and its view. */
function render<T extends object>(engine: Engine, type: Class<T>) {
  const ref = valueOrThrow(renderComponent(engine, type));
  return { ref, view: viewOf<T>(engine, ref.host.nativeElement) };
}

describe("rendering a root component's template again", () => {
  test("the template shows the component's current state, from the same instance", async () => {
    @Component({ selector: "tk-counter", template: "<p>{{ count() }}</p>" })
    class Counter {
      readonly count = signal(1);
    }
    const engine = Engine.create();
    const { ref, view } = render(engine, Counter);
    await tick();
    const instance = ref.instance;
    instance.count.set(5);
    view.rerender();
    await tick();
    expect(ref.host.nativeElement.querySelector("p")!.textContent)
      .toBe("5");
    expect(ref.instance)
      .toBe(instance);
  });

  test("the old nodes are removed: the host shows one render", async () => {
    @Component({ selector: "tk-once", template: "<p>once</p>" })
    class Once {}
    const { ref, view } = render(Engine.create(), Once);
    await tick();
    view.rerender();
    await tick();
    expect(ref.host.nativeElement.querySelectorAll("p"))
      .toHaveLength(1);
  });

  test("the component is not destroyed by a render: its onDestroy runs when its view is", async () => {
    const log: string[] = [];
    @Component({ selector: "tk-kept", template: "<p>kept</p>" })
    class Kept {
      onDestroy() {
        log.push("destroyed");
      }
    }
    const { ref, view } = render(Engine.create(), Kept);
    await tick();
    view.rerender();
    expect(log)
      .toEqual([]);
    ref.destroy();
    expect(log)
      .toEqual(["destroyed"]);
  });

  test("a rendered template can be rendered again, and again", async () => {
    @Component({ selector: "tk-many", template: "<p>{{ count() }}</p>" })
    class Many {
      readonly count = signal(0);
    }
    const { ref, view } = render(Engine.create(), Many);
    await tick();
    ref.instance.count.set(1);
    view.rerender();
    ref.instance.count.set(2);
    view.rerender();
    await tick();
    expect(ref.host.nativeElement.querySelector("p")!.textContent)
      .toBe("2");
    expect(ref.host.nativeElement.querySelectorAll("p"))
      .toHaveLength(1);
  });
});

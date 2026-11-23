// A component can inject the view container of its own host element, as a directive
// can. The components it adds are created under that element's injector: they inject
// what surrounds the element, and they are part of the parent's view.

import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { inject, Injectable } from "../../../di/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { RenderHooks } from "../authoring/render-hooks.ts";
import { ElementRef as ElementRefToken } from "../runtime/element-ref.ts";
import { ViewContainerRef } from "../runtime/view-container-ref.ts";

@Injectable()
class ListStore {
  readonly label = "from the list's providers";
}

@Component({ selector: "tk-item", template: `<li>{{ store.label }}</li>` })
class Item {
  readonly store = inject(ListStore);
}

describe("a component's ViewContainerRef", () => {
  test("a component can inject the view container of its host element", async () => {
    let container: ViewContainerRef | undefined;
    @Component({ selector: "tk-list", template: "<p>list</p>", providers: [ListStore] })
    class List {
      constructor() {
        container = inject(ViewContainerRef);
      }
    }
    const el = document.createElement("section");
    bootstrap(List, { host: el });
    await tick();
    expect(container)
      .toBeInstanceOf(ViewContainerRef);
  });

  test("a component's container creates components that inject its providers", async () => {
    @Component({ selector: "tk-list", template: "<p>list</p>", providers: [ListStore] })
    class List {
      private readonly container = inject(ViewContainerRef);
      add(): void {
        this.container.createComponent(Item);
      }
    }
    const wrapper = document.createElement("div");
    const el = document.createElement("section");
    wrapper.append(el);
    document.body.append(wrapper);
    const app = bootstrap(List, { host: el });
    await tick();
    app.root.instance.add();
    await tick();
    expect(wrapper.querySelector("li")!.textContent)
      .toBe("from the list's providers");
    app.destroy();
    wrapper.remove();
  });

  test("the components it adds are removed with it, as part of its view", async () => {
    @Component({ selector: "tk-list", template: "<p>list</p>", providers: [ListStore] })
    class List {
      private readonly container = inject(ViewContainerRef);
      add(): void {
        this.container.createComponent(Item);
      }
    }
    const wrapper = document.createElement("div");
    const el = document.createElement("section");
    wrapper.append(el);
    document.body.append(wrapper);
    const app = bootstrap(List, { host: el });
    await tick();
    app.root.instance.add();
    expect(wrapper.querySelectorAll("li"))
      .toHaveLength(1);
    app.destroy();
    expect(wrapper.querySelectorAll("li"))
      .toHaveLength(0);
    wrapper.remove();
  });
});

describe("a directive and a component on an element get the same element providers", () => {
  test("both inject ElementRef, ViewContainerRef, Effects and RenderHooks", async () => {
    const got: Record<string, boolean> = {};
    @Directive({ selector: "[probe]" })
    class Probe {
      constructor() {
        got.directive = [
          inject(ElementRefToken),
          inject(ViewContainerRef),
          inject(Effects),
          inject(RenderHooks),
        ].every((value) => value !== undefined);
      }
    }
    @Component({ selector: "tk-target", template: "<p>x</p>" })
    class Target {
      constructor() {
        got.component = [
          inject(ElementRefToken),
          inject(ViewContainerRef),
          inject(Effects),
          inject(RenderHooks),
        ].every((value) => value !== undefined);
      }
    }
    @Component({ selector: "tk-host", template: `<tk-target probe></tk-target>`, imports: [Target, Probe] })
    class Host {}
    bootstrap(Host, { host: document.createElement("section") });
    await tick();
    expect(got)
      .toEqual({ directive: true, component: true });
  });
});

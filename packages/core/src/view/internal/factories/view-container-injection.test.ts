import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { inject, Injectable } from "../../../di/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { ViewContainerRef } from "../runtime/view-container-ref.ts";

@Injectable()
class Store {
  readonly name = "store";
}

@Component({ selector: "tk-item", template: "<p>{{ store.name }}</p>" })
class Item {
  readonly store = inject(Store);
}

describe("a directive can inject the ViewContainerRef of its element", () => {
  test("components it creates are inserted after its element, in the same parent", async () => {
    @Directive({ selector: "[list]", providers: [Store] })
    class List {
      constructor() {
        inject(ViewContainerRef)
          .createComponent(Item);
      }
    }
    @Component({ selector: "tk-a", template: "<div list></div><span>after</span>", imports: [List] })
    class A {}
    const host = document.createElement("section");
    Engine.create()
      .createComponent(A, host);
    const div = host.querySelector("div")!;
    await tick();
    expect(div.nextElementSibling!.tagName)
      .toBe("TK-ITEM");
    expect(host.querySelector("span")!.textContent)
      .toBe("after");
  });

  test("the created component injects what its element's directives provide", async () => {
    @Directive({ selector: "[list]", providers: [Store] })
    class List {
      constructor() {
        inject(ViewContainerRef)
          .createComponent(Item);
      }
    }
    @Component({ selector: "tk-a", template: "<div list></div>", imports: [List] })
    class A {}
    const host = document.createElement("section");
    Engine.create()
      .createComponent(A, host);
    await tick();
    expect(host.querySelector("tk-item p")!.textContent)
      .toBe("store");
  });

  test("destroying the owner removes its dynamic components and the anchor", async () => {
    @Directive({ selector: "[list]", providers: [Store] })
    class List {
      constructor() {
        inject(ViewContainerRef)
          .createComponent(Item);
      }
    }
    @Component({ selector: "tk-a", template: "<div list></div>", imports: [List] })
    class A {}
    const host = document.createElement("section");
    const view = Engine.create()
      .createComponent(A, host);
    await tick();
    expect(host.querySelector("tk-item"))
      .not.toBeNull();
    view.destroy();
    expect(host.innerHTML)
      .toBe("");
  });

  test("an element whose directives do not inject it gets no anchor", async () => {
    @Directive({ selector: "[plain]" })
    class Plain {}
    @Component({ selector: "tk-a", template: "<div plain></div>", imports: [Plain] })
    class A {}
    const host = document.createElement("section");
    Engine.create()
      .createComponent(A, host);
    await tick();
    expect(host.innerHTML)
      .toBe("<div plain=\"\"></div>");
  });

  test("an element not placed in the DOM (unslotted content) has no anchor: using its container throws", () => {
    @Directive({ selector: "[list]", providers: [Store] })
    class List {
      readonly container = inject(ViewContainerRef);
    }
    @Component({ selector: "tk-plain", template: "" })
    class Plain {}
    @Component({
      selector: "tk-a",
      template: `<tk-plain><div list></div></tk-plain>`,
      imports: [List, Plain],
    })
    class A {}
    const host = document.createElement("section");
    const view = Engine.create()
      .createComponent(A, host);
    expect(() => view.destroy())
      .not.toThrow();
  });
});

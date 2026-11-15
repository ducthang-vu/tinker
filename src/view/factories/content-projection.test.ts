import { describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { signal } from "../../signals/index.ts";

@Component({ selector: "tk-card", template: "<div><slot></slot></div>" })
class Card {}

@Component({
  selector: "tk-titled",
  template: `<h1><slot name="title"></slot></h1><section><slot></slot></section>`,
})
class Titled {}

describe("content projection", () => {
  test("the default <slot> shows the children of the component's element", () => {
    @Component({ selector: "tk-a", template: "<tk-card><p>hi</p></tk-card>", imports: [Card] })
    class A {}
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    expect(host.querySelector("tk-card div p")!.textContent)
      .toBe("hi");
  });

  test("a named <slot> takes the children with slot=\"name\"; the rest go to the default one", () => {
    @Component({
      selector: "tk-a",
      template: `<tk-titled><b slot="title">T</b><i>body</i></tk-titled>`,
      imports: [Titled],
    })
    class A {}
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    expect(host.querySelector("h1 b")!.textContent)
      .toBe("T");
    expect(host.querySelector("section i")!.textContent)
      .toBe("body");
  });

  test("text is content too: it goes to the default slot", () => {
    @Component({
      selector: "tk-a",
      template: "<tk-card>plain text</tk-card>",
      imports: [Card],
    })
    class A {}
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    expect(host.querySelector("tk-card div")!.textContent)
      .toBe("plain text");
  });

  test("content that no slot takes is not rendered, and does not throw", () => {
    @Component({ selector: "tk-plain", template: "<div>inside</div>" })
    class Plain {}
    @Component({
      selector: "tk-a",
      template: `<tk-plain><p>lost</p></tk-plain>`,
      imports: [Plain],
    })
    class A {}
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    expect(host.textContent)
      .toBe("inside");
  });

  test("a second <slot> with the same name shows nothing: the first one takes the content", () => {
    @Component({
      selector: "tk-twice",
      template: "<div><slot></slot></div><footer><slot></slot></footer>",
    })
    class Twice {}
    @Component({
      selector: "tk-a",
      template: `<tk-twice><p>once</p></tk-twice>`,
      imports: [Twice],
    })
    class A {}
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    expect(host.querySelectorAll("p"))
      .toHaveLength(1);
    expect(host.querySelector("div p")!.textContent)
      .toBe("once");
    expect(host.querySelector("footer")!.textContent)
      .toBe("");
  });

  test("projected content is bound in the parent: its signals update it", () => {
    @Component({
      selector: "tk-a",
      template: "<tk-card><p>{{ name() }}</p></tk-card>",
      imports: [Card],
    })
    class A {
      readonly name = signal("first");
    }
    const engine = Engine.create();
    const host = document.createElement("div");
    const view = engine.createComponent(A, host);
    expect(host.querySelector("p")!.textContent)
      .toBe("first");
    view.instance.name.set("second");
    engine.flush();
    expect(host.querySelector("p")!.textContent)
      .toBe("second");
  });

  test("a projected element's event handler belongs to the parent", () => {
    let clicks = 0;
    @Component({
      selector: "tk-a",
      template: `<tk-card><button (click)="go()">x</button></tk-card>`,
      imports: [Card],
    })
    class A {
      go() {
        clicks += 1;
      }
    }
    const host = document.createElement("div");
    Engine.create()
      .createComponent(A, host);
    host.querySelector("button")!.click();
    expect(clicks)
      .toBe(1);
  });

  test("destroying the parent removes the projected content with its element", () => {
    @Component({
      selector: "tk-a",
      template: "<tk-card><p>x</p></tk-card>",
      imports: [Card],
    })
    class A {}
    const host = document.createElement("div");
    const view = Engine.create()
      .createComponent(A, host);
    view.destroy();
    expect(host.children)
      .toHaveLength(0);
  });
});

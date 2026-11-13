import { afterEach, describe, expect, test } from "vitest";
import { inject, Injectable, provide } from "../../di/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { ElementRef } from "../runtime/element-ref.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("host directives", () => {
  test("are created before the component, which can inject them", () => {
    const order: string[] = [];
    @Directive({ selector: "[focusable]" })
    class Focusable {
      constructor() {
        order.push("focusable");
      }
    }
    @Directive({ selector: "[draggable]" })
    class Draggable {
      constructor() {
        order.push("draggable");
      }
    }
    @Component({ selector: "tk-menu", template: "", hostDirectives: [Focusable, Draggable] })
    class Menu {
      readonly focusable = inject(Focusable);
      readonly draggable = inject(Draggable);
      constructor() {
        order.push("menu");
      }
    }
    const engine = Engine.create();
    const view = engine.createComponent(Menu);

    expect(order)
      .toEqual(["focusable", "draggable", "menu"]);
    expect(engine.getContext(view.host)
      .map((context) => context.directives)
      .getOrElse([]))
      .toEqual([view.component.focusable, view.component.draggable]);
  });

  test("are on the host element: ElementRef, and their host listeners", () => {
    @Directive({ selector: "[clickable]", host: { "(click)": "click()" } })
    class Clickable {
      readonly host = inject(ElementRef);
      clicks = 0;
      click() {
        this.clicks++;
      }
    }
    @Component({ selector: "tk-button", template: "<span>ok</span>", hostDirectives: [Clickable] })
    class Button {
      readonly clickable = inject(Clickable);
      readonly host = inject(ElementRef);
    }
    const view = Engine.create()
      .createComponent(Button);
    (view.host.querySelector("span") as HTMLElement).click(); // bubbles to the host
    expect(view.component.clickable.host.nativeElement)
      .toBe(view.host);
    expect(view.component.host.nativeElement)
      .toBe(view.host);
    expect(view.component.clickable.clicks)
      .toBe(1);
  });

  test("their providers are in the component's injector, as are the component's", () => {
    @Injectable()
    class DragState {}
    @Injectable()
    class MenuState {}
    @Directive({ selector: "[draggable]", providers: [DragState] })
    class Draggable {
      readonly state = inject(DragState);
    }
    @Component({
      selector: "tk-menu",
      template: "",
      hostDirectives: [Draggable],
      providers: [MenuState],
    })
    class Menu {
      readonly draggable = inject(Draggable);
      readonly dragState = inject(DragState);
      readonly menuState = inject(MenuState);
    }
    const { component } = Engine.create()
      .createComponent(Menu);
    expect(component.dragState)
      .toBe(component.draggable.state);
    expect(component.menuState)
      .toBeInstanceOf(MenuState);
  });

  test("the directives of the component's template can inject them", () => {
    @Directive({ selector: "[focusable]" })
    class Focusable {}
    @Directive({ selector: "[item]" })
    class Item {
      readonly focusable = inject(Focusable);
    }
    @Component({
      selector: "tk-menu",
      template: "<li item>a</li>",
      hostDirectives: [Focusable],
      imports: [Item],
    })
    class Menu {
      readonly focusable = inject(Focusable);
    }
    const engine = Engine.create();
    const view = engine.createComponent(Menu);
    const [item] = engine.getContext(view.host.querySelector("li")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Item];
    expect(item.focusable)
      .toBe(view.component.focusable);
  });

  test("are destroyed with the component, and leave its host clean", () => {
    const destroyed: string[] = [];
    @Directive({ selector: "[tracked]" })
    class Tracked {
      onDestroy() {
        destroyed.push("tracked");
      }
    }
    @Component({ selector: "tk-a", template: "", hostDirectives: [Tracked] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    view.destroy();
    expect(destroyed)
      .toEqual(["tracked"]);
    expect(engine.getContext(view.host)
      .isNone())
      .toBe(true);
  });

  test("the component cannot replace ElementRef with its own providers", () => {
    const fake = document.createElement("fake");
    @Component({ selector: "tk-a", template: "", providers: [provide(ElementRef, { useValue: new ElementRef(fake) })] })
    class A {
      readonly host = inject(ElementRef);
    }
    const view = Engine.create()
      .createComponent(A);
    expect(view.component.host.nativeElement)
      .toBe(view.host);
  });

  test("must be directives, and not components", () => {
    class Plain {}
    @Component({ selector: "tk-other", template: "" })
    class Other {}
    @Component({ selector: "tk-a", template: "", hostDirectives: [Plain] })
    class WithPlain {}
    @Component({ selector: "tk-b", template: "", hostDirectives: [Other] })
    class WithComponent {}
    const engine = Engine.create();
    expect(() => engine.createComponent(WithPlain))
      .toThrow("Plain is not a directive: decorate it with @Directive");
    expect(() => engine.createComponent(WithComponent))
      .toThrow("Other is a component: it cannot be a host directive of WithComponent");
  });
});

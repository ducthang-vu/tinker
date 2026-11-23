import { afterEach, describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { inject, Injectable, provide } from "../../../di/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { ElementRef } from "../runtime/element-ref.ts";
import { valueOrThrow, isNone, getOrElse, map } from "@tinker/functional";
import { messageOf } from "../test-support.ts";
import { renderComponent } from "../test-support.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("host directives", () => {
  test("are created before the component, which can inject them", async () => {
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
    const view = valueOrThrow(renderComponent(engine, Menu));

    await tick();

    expect(order)
      .toEqual(["focusable", "draggable", "menu"]);
    expect(
      getOrElse(
        map(engine.getContext(view.host.nativeElement), (context) => context.directives),
        [],
      ),
    )
      .toEqual([view.instance.focusable, view.instance.draggable]);
  });

  test("are on the host element: ElementRef, and their host listeners", async () => {
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
    const view = valueOrThrow(renderComponent(Engine.create(), Button));
    (view.host.nativeElement.querySelector("span") as HTMLElement).click(); // bubbles to the host
    await tick();
    expect(view.instance.clickable.host.nativeElement)
      .toBe(view.host.nativeElement);
    expect(view.instance.host.nativeElement)
      .toBe(view.host.nativeElement);
    expect(view.instance.clickable.clicks)
      .toBe(1);
  });

  test("their providers are in the component's injector, as are the component's", async () => {
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
    const { instance: component } = valueOrThrow(renderComponent(Engine.create(), Menu));
    await tick();
    expect(component.dragState)
      .toBe(component.draggable.state);
    expect(component.menuState)
      .toBeInstanceOf(MenuState);
  });

  test("the directives of the component's template can inject them", async () => {
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
    const view = valueOrThrow(renderComponent(engine, Menu));
    const [item] = getOrElse(map(engine.getContext(view.host.nativeElement.querySelector("li")!), (context) => context.directives), []) as [Item];
    await tick();
    expect(item.focusable)
      .toBe(view.instance.focusable);
  });

  test("are destroyed with the component, and leave its host clean", async () => {
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
    const view = valueOrThrow(renderComponent(engine, A));
    view.destroy();
    await tick();
    expect(destroyed)
      .toEqual(["tracked"]);
    expect(isNone(engine.getContext(view.host.nativeElement)))
      .toBe(true);
  });

  test("the component cannot replace ElementRef with its own providers", async () => {
    const fake = document.createElement("fake");
    @Component({ selector: "tk-a", template: "", providers: [provide(ElementRef, { useValue: new ElementRef(fake) })] })
    class A {
      readonly host = inject(ElementRef);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), A));
    await tick();
    expect(view.instance.host.nativeElement)
      .toBe(view.host.nativeElement);
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
    expect(messageOf(renderComponent(engine, WithPlain)))
      .toBe("Plain is not a directive: decorate it with @Directive");
    expect(messageOf(renderComponent(engine, WithComponent)))
      .toBe("Other is a component: it cannot be a host directive of WithComponent");
  });
});

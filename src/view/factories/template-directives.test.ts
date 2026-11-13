import { afterEach, describe, expect, test } from "vitest";
import { inject, Injectable, InjectionToken, provide } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Effects } from "../authoring/effects.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import { ELEMENT } from "../tokens.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("directives in templates", () => {
  test("are created on the elements matching their selector, with their element", () => {
    const seen: string[] = [];
    @Directive({ selector: "[highlight]" })
    class Highlight {
      readonly element = inject(ELEMENT);
      constructor() {
        seen.push(this.element.localName);
      }
    }
    @Component({
      selector: "tk-a",
      template: `<p highlight>a</p><span>b</span><b highlight>c</b>`,
      imports: [Highlight],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);

    expect(seen)
      .toEqual(["p", "b"]);
    const p = view.host.querySelector("p")!;
    expect(engine.getContext(p)
      .map((context) => context.directives.length)
      .getOrElse(0))
      .toBe(1);
  });

  test("only the directives the component imports are matched", () => {
    const created: string[] = [];
    @Directive({ selector: "[tip]" })
    class Tip {
      constructor() {
        created.push("tip");
      }
    }
    @Component({ selector: "tk-a", template: `<p tip>a</p>` })
    class WithoutImport {}
    Engine.create()
      .createComponent(WithoutImport);
    expect(created)
      .toEqual([]);
    expect(Tip)
      .toBeDefined();
  });

  test("apply their host listeners", () => {
    @Directive({ selector: "[counter]", host: { "(click)": "increment()" } })
    class Counter {
      count = 0;
      increment() {
        this.count++;
      }
    }
    @Component({ selector: "tk-a", template: `<button counter>+</button>`, imports: [Counter] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const button = view.host.querySelector("button")!;
    button.click();
    button.click();
    const [counter] = engine.getContext(button)
      .map((context) => context.directives)
      .getOrElse([]) as Counter[];
    expect(counter!.count)
      .toBe(2);
  });

  test("directives on the same element can inject each other, whatever their order", () => {
    @Directive({ selector: "[model]" })
    class Model {
      readonly value = "model value";
    }
    @Directive({ selector: "[validator]" })
    class Validator {
      readonly model = inject(Model);
    }
    @Component({
      selector: "tk-a",
      template: `<input model validator>`,
      imports: [Validator, Model],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [validator, model] = engine.getContext(view.host.querySelector("input")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Validator, Model];
    expect(validator.model)
      .toBe(model);
  });

  test("a directive can inject the directives of its ancestors, and the component's providers", () => {
    @Injectable()
    class Theme {
      readonly color = "red";
    }
    @Directive({ selector: "form" })
    class Form {}
    @Directive({ selector: "[model]" })
    class Model {
      readonly form = inject(Form);
      readonly theme = inject(Theme);
    }
    @Component({
      selector: "tk-a",
      template: `<form><fieldset><input model></fieldset></form>`,
      imports: [Form, Model],
      providers: [Theme],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [form] = engine.getContext(view.host.querySelector("form")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Form];
    const [model] = engine.getContext(view.host.querySelector("input")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Model];
    expect(model.form)
      .toBe(form);
    expect(model.theme.color)
      .toBe("red");
  });

  test("a directive cannot inject the directives of its descendants", () => {
    @Directive({ selector: "[child]" })
    class Child {}
    @Directive({ selector: "[parent]" })
    class Parent {
      readonly child = inject(Child, { optional: true });
    }
    @Component({
      selector: "tk-a",
      template: `<div parent><p child></p></div>`,
      imports: [Parent, Child],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const [parent] = engine.getContext(view.host.querySelector("div")!)
      .map((context) => context.directives)
      .getOrElse([]) as [Parent];
    expect(parent.child)
      .toBeNull();
  });

  test("plain attributes bind inputs of the same name, case-insensitively, before the first render", () => {
    const seen: string[] = [];
    @Directive({ selector: "[tooltip]" })
    class Tooltip {
      readonly text = input<string>();
      readonly maxWidth = input("auto");
      readonly position = input("top");
      constructor() {
        inject(Effects)
          .create(() => void seen.push(`${this.text()} ${this.maxWidth()} ${this.position()}`));
      }
    }
    @Component({
      selector: "tk-a",
      template: `<button tooltip text="Save" maxWidth="200">Save</button>`,
      imports: [Tooltip],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    engine.flush();
    expect(seen)
      .toEqual(["Save 200 top"]);
    expect(view.host.querySelector("button")!.getAttribute("text"))
      .toBe("Save");
  });

  test("are destroyed with the view: onDestroy, effects, and the element's context", () => {
    const log: string[] = [];
    const count = signal(1);
    @Directive({ selector: "[tracked]" })
    class Tracked {
      constructor() {
        inject(Effects)
          .create(() => void log.push(`effect ${count()}`));
      }

      onDestroy() {
        log.push("destroyed");
      }
    }
    @Component({ selector: "tk-a", template: `<p tracked>a</p>`, imports: [Tracked] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const p = view.host.querySelector("p")!;
    engine.flush();
    view.destroy();
    count.set(2);
    engine.flush();
    expect(log)
      .toEqual(["effect 1", "destroyed"]);
    expect(engine.getContext(p)
      .isNone())
      .toBe(true);
  });

  test("a directive whose constructor throws leaves nothing behind", () => {
    const destroyed: string[] = [];
    @Directive({ selector: "[ok]" })
    class Ok {
      onDestroy() {
        destroyed.push("ok");
      }
    }
    @Directive({ selector: "[broken]" })
    class Broken {
      constructor() {
        throw new Error("directive failed");
      }
    }
    @Component({ selector: "tk-a", template: `<p ok></p><p broken></p>`, imports: [Ok, Broken] })
    class A {}
    const host = document.createElement("div");
    const engine = Engine.create();
    expect(() => engine.createComponent(A, host))
      .toThrow("directive failed");
    expect(host.innerHTML)
      .toBe("");
    expect(destroyed)
      .toEqual(["ok"]);
    expect(engine.getContext(host)
      .isNone())
      .toBe(true);
  });
});

describe("imports errors", () => {
  test("importing a class that is not a directive", () => {
    class Plain {}
    @Component({ selector: "tk-a", template: "", imports: [Plain] })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow("Plain is not a directive: decorate it with @Directive");
  });

  test("an imported directive with an unsupported selector", () => {
    @Directive({ selector: "div p" })
    class Nested {}
    @Component({ selector: "tk-a", template: "", imports: [Nested] })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow(`Nested, imported by A: Unsupported selector "div p"`);
  });

  test("a component used in a template is reported as not supported yet", () => {
    @Component({ selector: "tk-child", template: "" })
    class Child {}
    @Component({ selector: "tk-a", template: "<tk-child></tk-child>", imports: [Child] })
    class A {}
    expect(() => Engine.create()
      .createComponent(A))
      .toThrow("Components in templates are not supported yet: <tk-child> matches Child");
  });
});

describe("directive providers", () => {
  test("each element gets its own, shared with its other directives and its descendants'", () => {
    let created = 0;
    @Injectable()
    class State {
      readonly id = ++created;
    }
    @Directive({ selector: "[stateful]", providers: [State] })
    class Stateful {
      readonly state = inject(State);
    }
    @Directive({ selector: "[sibling]" })
    class Sibling {
      readonly state = inject(State);
    }
    @Directive({ selector: "[inner]" })
    class Inner {
      readonly state = inject(State);
    }
    @Component({
      selector: "tk-a",
      template: `<div stateful sibling><p inner></p></div><div stateful></div>`,
      imports: [Stateful, Sibling, Inner],
    })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const directivesOf = (element: Element) => engine.getContext(element)
      .map((context) => context.directives)
      .getOrElse([]);
    const [first, second] = [...view.host.querySelectorAll("div")];
    const [stateful, sibling] = directivesOf(first!) as [Stateful, Sibling];
    const [inner] = directivesOf(view.host.querySelector("p")!) as [Inner];
    const [otherStateful] = directivesOf(second!) as [Stateful];

    expect(sibling.state)
      .toBe(stateful.state);
    expect(inner.state)
      .toBe(stateful.state);
    expect(otherStateful.state)
      .not.toBe(stateful.state);
    expect(created)
      .toBe(2);
  });

  test("are destroyed with their element", () => {
    const destroyed: string[] = [];
    @Injectable()
    class Resource {
      onDestroy() {
        destroyed.push("resource");
      }
    }
    @Directive({ selector: "[owner]", providers: [Resource] })
    class Owner {
      readonly resource = inject(Resource);
    }
    @Component({ selector: "tk-a", template: `<p owner></p>`, imports: [Owner] })
    class A {}
    const view = Engine.create()
      .createComponent(A);
    expect(destroyed)
      .toEqual([]);
    view.destroy();
    expect(destroyed)
      .toEqual(["resource"]);
  });

  test("cannot replace what the framework provides; between directives, the first imported wins", () => {
    const LABEL = new InjectionToken<string>("LABEL");
    const fake = document.createElement("fake");
    @Directive({
      selector: "[first]",
      providers: [provide(ELEMENT, { useValue: fake }), provide(LABEL, { useValue: "first" })],
    })
    class First {
      readonly element = inject(ELEMENT);
      readonly label = inject(LABEL);
    }
    @Directive({ selector: "[second]", providers: [provide(LABEL, { useValue: "second" })] })
    class Second {}
    @Component({ selector: "tk-a", template: `<p first second></p>`, imports: [First, Second] })
    class A {}
    const engine = Engine.create();
    const view = engine.createComponent(A);
    const p = view.host.querySelector("p")!;
    const [first] = engine.getContext(p)
      .map((context) => context.directives)
      .getOrElse([]) as [First];
    expect(first.element)
      .toBe(p);
    expect(first.label)
      .toBe("first");
    expect(Second)
      .toBeDefined();
  });
});

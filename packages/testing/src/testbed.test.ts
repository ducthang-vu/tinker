import { describe, expect, test, vi } from "vitest";
import {
  classToken,
  Component,
  Directive,
  Effect,
  InjectionToken,
  input,
  InputNotBoundError,
  output,
  provide,
  signal,
} from "@tinker/core";
import { cleanup, ComponentBuilder, MockComponentBuilder, MockDirectiveBuilder, registerCleanup, TestBed } from "./testbed.ts";

@Component({ selector: "tk-greeting", template: "<h1>Hello {{ name() }}</h1>" })
class Greeting {
  readonly name = input("world");
}

@Directive({ selector: "[mark]" })
class Mark {
  readonly label = input("m");
  readonly must = input<string>();
}

@Directive({ selector: "[named]", exportAs: "named" })
class Named {}

@Component({ selector: "tk-card", template: "<b>card</b>", exportAs: "card" })
class Card {}

@Directive({ selector: "[pick]" })
class Pick {
  readonly picked = output<number>();
}

@Component({ selector: "tk-item", template: "<b mark>x</b>", imports: [Mark] })
class Item {}

@Component({
  selector: "tk-list",
  template: "<ul><li mark>a</li><li>b</li></ul><tk-item></tk-item>",
  imports: [Mark, Item],
})
class List {}

@Component({ selector: "tk-item", template: "<i>stub</i>" })
class StubItem {
  static readonly mockOf = Item;
}

describe("TestBed.build", () => {
  test("needs a component", () => {
    expect(() => TestBed.providers()
      .build())
      .toThrow("TestBed.build needs a component");
  });

  test("renders the component as the root", () => {
    const ref = TestBed.component(Greeting)
      .build();
    expect(ref.root.instance)
      .toBeInstanceOf(Greeting);
    expect(ref.root.element.textContent)
      .toBe("Hello world");
    ref.destroy();
  });

  test("renders into the host element it is given", () => {
    const host = document.createElement("section");
    const ref = TestBed.host(host)
      .component(Greeting)
      .build();
    expect(ref.root.element)
      .toBe(host);
    ref.destroy();
  });

  test("sets the inputs it is given before the first render", () => {
    const ref = TestBed.inputs({ name: "Ada" })
      .component(Greeting)
      .build();
    expect(ref.root.element.textContent)
      .toBe("Hello Ada");
    ref.destroy();
  });

  test("provides the services it is given", () => {
    const TOKEN = new InjectionToken<string>("TOKEN");
    const ref = TestBed.providers(provide(TOKEN, { useValue: "given" }))
      .component(Greeting)
      .build();
    expect(ref.get(TOKEN))
      .toBe("given");
    ref.destroy();
  });

  test("get takes a service's class as well as its token", () => {
    class Clock {}
    const clock = new Clock();
    const fixture = TestBed.providers(provide(Clock, { useValue: clock }))
      .component(Greeting)
      .build();
    expect(fixture.get(Clock))
      .toBe(clock);
    expect(fixture.get(classToken(Clock)))
      .toBe(clock);
    fixture.destroy();
  });

  test("destroy can be called twice", () => {
    const ref = TestBed.component(Greeting)
      .build();
    ref.destroy();
    expect(() => ref.destroy())
      .not.toThrow();
  });

  test("whenStable resolves after a change detection tick", async () => {
    const ref = TestBed.component(Greeting)
      .build();
    await expect(ref.whenStable())
      .resolves.toBeUndefined();
    ref.destroy();
  });
});

describe("Fixture.root", () => {
  test("setInput changes the component after detectChanges", () => {
    const ref = TestBed.component(Greeting)
      .build();
    ref.root.setInput("name", "Grace");
    ref.detectChanges();
    expect(ref.root.inputs.name)
      .toBe("Grace");
    expect(ref.root.element.textContent)
      .toBe("Hello Grace");
    expect(() => ref.root.setInput("unknown", 1))
      .toThrow("has no input \"unknown\"");
    ref.destroy();
  });
});

describe("fixture query, when there is no match", () => {
  test("returns the match", () => {
    const ref = TestBed.component(List)
      .build();
    expect(ref.root.query("ul").element.tagName)
      .toBe("UL");
    expect(ref.root.query(Mark).instance)
      .toBeInstanceOf(Mark);
    ref.destroy();
  });

  test("throws, naming what was looked for, when there is no match", () => {
    const ref = TestBed.component(List)
      .build();
    expect(() => ref.root.query("missing"))
      .toThrow("No \"missing\" found under this element");
    expect(() => ref.root.query(StubItem))
      .toThrow("No StubItem found under this element");
    ref.destroy();
  });
});

describe("fixture queries", () => {
  test("a selector finds elements, and element fixtures can be queried further", () => {
    const ref = TestBed.component(List)
      .build();
    expect(ref.root.query("li").element.textContent)
      .toBe("a");
    expect(ref.root.queryAll("li"))
      .toHaveLength(2);
    expect(ref.root.query("ul")
      .query("li").element.textContent)
      .toBe("a");
    expect(ref.root.queryAll("missing"))
      .toHaveLength(0);
    ref.destroy();
  });

  test("a selector with :not(...) excludes the elements it names", () => {
    const ref = TestBed.component(List)
      .build();
    expect(ref.root.queryAll("li:not([mark])")
      .map((item) => item.element.textContent))
      .toEqual(["b"]);
    expect(ref.root.queryAll("li:not([mark]), li[mark]"))
      .toHaveLength(2);
    ref.destroy();
  });

  test("a class finds the directive and component instances, nested ones included", () => {
    const ref = TestBed.component(List)
      .build();
    const first = ref.root.query(Mark);
    expect(first.instance)
      .toBeInstanceOf(Mark);
    expect(first.element.textContent)
      .toBe("a");
    const all = ref.root.queryAll(Mark);
    expect(all.map((fixture) => fixture.element.textContent))
      .toEqual(["a", "x"]);
    expect(ref.root.query(Item).instance)
      .toBeInstanceOf(Item);
    expect(ref.root.queryAll(StubItem))
      .toHaveLength(0);
    ref.destroy();
  });

  test("a directive fixture sets and reads its inputs", () => {
    const ref = TestBed.component(List)
      .build();
    const mark = ref.root.query(Mark);
    expect(mark.inputs.label)
      .toBe("m");
    mark.setInput("label", "changed");
    expect(mark.inputs.label)
      .toBe("changed");
    expect(() => mark.setInput("unknown", 1))
      .toThrow("has no input \"unknown\"");
    ref.destroy();
  });

  test("reading an input nothing has bound throws", () => {
    const ref = TestBed.component(List)
      .build();
    const mark = ref.root.query(Mark);
    expect(() => mark.inputs.must)
      .toThrow(InputNotBoundError);
    ref.destroy();
  });

  test("a directive fixture subscribes to its outputs and emits them", () => {
    const Host = ComponentBuilder.template("<p pick>x</p>")
      .directives(Pick)
      .build();
    const ref = TestBed.component(Host)
      .build();
    const pick = ref.root.query(Pick);
    const seen: number[] = [];
    pick.outputs.picked.run({ next: (value) => seen.push(value) });
    pick.emitOutput("picked", 3);
    expect(() => pick.emitOutput("unknown", 4))
      .toThrow("has no output \"unknown\"");
    expect(seen)
      .toEqual([3]);
    ref.destroy();
  });
});

describe("ComponentBuilder", () => {
  test("builds a component from a template, with the directives it may use", () => {
    const Host = ComponentBuilder.template("<p mark>hi</p>")
      .directives(Mark)
      .build();
    const ref = TestBed.component(Host)
      .build();
    expect(ref.root.query(Mark).instance)
      .toBeInstanceOf(Mark);
    ref.destroy();
  });

  test("the template can be set again on the builder", () => {
    const Host = ComponentBuilder.template("<p>first</p>")
      .template("<p>second</p>")
      .build();
    const ref = TestBed.component(Host)
      .build();
    expect(ref.root.element.textContent)
      .toBe("second");
    ref.destroy();
  });
});

describe("TestBed.override", () => {
  test("a class is found as its replacement, in the page and in queries", () => {
    const ref = TestBed.override(Item, StubItem)
      .component(List)
      .build();
    expect(ref.root.query("i").element.textContent)
      .toBe("stub");
    expect(ref.root.query(Item).instance)
      .toBeInstanceOf(StubItem);
    ref.destroy();
  });
});

@Component({
  selector: "tk-clicker",
  template: "<button id=\"go\" (click)=\"press()\">{{ clicks() }}</button>",
})
class Clicker {
  readonly clicks = signal(0);

  press(): void {
    this.clicks.update((count) => count + 1);
  }
}

describe("TestingElement methods", () => {
  test("getAttribute reads an attribute, or null when it is not set", () => {
    const Host = ComponentBuilder.template("<p id=\"intro\">hi</p>")
      .build();
    const ref = TestBed.component(Host)
      .build();
    expect(ref.root.query("p")
      .getAttribute("id"))
      .toBe("intro");
    expect(ref.root.query("p")
      .getAttribute("title"))
      .toBeNull();
    ref.destroy();
  });

  test("dispatchEvent runs the listeners, then renders what they changed", () => {
    const ref = TestBed.component(Clicker)
      .build();
    ref.root.query("button")
      .dispatchEvent("click");
    expect(ref.root.query("button").element.textContent)
      .toBe("1");
    ref.root.query("button")
      .dispatchEvent("click");
    expect(ref.root.query("button").element.textContent)
      .toBe("2");
    ref.destroy();
  });
});

describe("cleanup", () => {
  test("destroys the fixtures left behind, and keeps the manual ones", () => {
    const left = TestBed.component(Clicker)
      .build();
    const kept = TestBed.manualCleanup()
      .component(Clicker)
      .build();
    const leftButton = left.root.query("button").element;
    cleanup();
    leftButton.dispatchEvent(new Event("click"));
    expect(leftButton.textContent)
      .toBe("0");
    kept.root.query("button")
      .dispatchEvent("click");
    expect(kept.root.query("button").element.textContent)
      .toBe("1");
    kept.destroy();
  });
});

describe("registerCleanup", () => {
  test("registers cleanup with the runner's afterEach, when there is one", () => {
    const hooks: (() => void)[] = [];
    registerCleanup((hook) => {
      hooks.push(hook);
    });
    expect(hooks)
      .toEqual([cleanup]);
  });

  test("registers nothing without one", () => {
    expect(() => registerCleanup(undefined))
      .not.toThrow();
  });
});

describe("mock builders", () => {
  test("keeps the selector, and renders nothing", () => {
    const mock = new MockComponentBuilder(Item)
      .build();
    const ref = TestBed.override(Item, mock)
      .component(List)
      .build();
    expect(ref.root.queryAll("b"))
      .toHaveLength(0);
    expect(ref.root.queryAll(Item))
      .toHaveLength(1);
    ref.destroy();
  });

  test("recreates the inputs it names, so a parent template can bind them", () => {
    const mock = new MockDirectiveBuilder(Mark)
      .optionalInputs({ label: "m" })
      .build();
    const Host = ComponentBuilder.template("<p mark>x</p>")
      .directives(Mark)
      .build();
    const ref = TestBed.override(Mark, mock)
      .component(Host)
      .build();
    ref.root.query(Mark)
      .setInput("label", "x");
    expect(ref.root.query(Mark).inputs.label)
      .toBe("x");
    ref.destroy();
  });

  test("a required input is unbound until set, an optional one has its default", () => {
    const required = new MockDirectiveBuilder(Mark)
      .requiredInputs("label")
      .build();
    const optional = new MockDirectiveBuilder(Mark)
      .optionalInputs({ label: "m" })
      .build();
    const Host = ComponentBuilder.template("<p mark>x</p>")
      .directives(Mark)
      .build();
    const requiredRef = TestBed.override(Mark, required)
      .component(Host)
      .build();
    expect(() => requiredRef.root.query(Mark).inputs.label)
      .toThrow(InputNotBoundError);
    requiredRef.destroy();
    const optionalRef = TestBed.override(Mark, optional)
      .component(Host)
      .build();
    expect(optionalRef.root.query(Mark).inputs.label)
      .toBe("m");
    optionalRef.destroy();
  });

  test("recreates the outputs it names, so a parent template can listen", () => {
    const mock = new MockDirectiveBuilder(Pick)
      .outputs("picked")
      .build();
    const Host = ComponentBuilder.template("<p pick>x</p>")
      .directives(Pick)
      .build();
    const ref = TestBed.override(Pick, mock)
      .component(Host)
      .build();
    const seen: number[] = [];
    ref.root.query(Pick).outputs.picked.run({ next: (value) => seen.push(value) });
    ref.root.query(Pick)
      .emitOutput("picked", 3);
    expect(seen)
      .toEqual([3]);
    ref.destroy();
  });

  test("keeps exportAs, so a template can name the mock", () => {
    const mock = MockDirectiveBuilder.of(Named)
      .build();
    const Host = ComponentBuilder.template("<p named #n=\"named\">x</p>")
      .directives(Named)
      .build();
    const ref = TestBed.override(Named, mock)
      .component(Host)
      .build();
    expect(ref.root.query("p").element.textContent)
      .toBe("x");
    ref.destroy();
  });

  test("a component mock keeps exportAs too", () => {
    const mock = new MockComponentBuilder(Card)
      .build();
    const Host = ComponentBuilder.template("<tk-card #c=\"card\"></tk-card>")
      .directives(Card)
      .build();
    const ref = TestBed.override(Card, mock)
      .component(Host)
      .build();
    expect(ref.root.query(Card).instance)
      .toBeInstanceOf(mock);
    ref.destroy();
  });

  test("a component mock declares inputs, and of() starts the chain", () => {
    const mock = MockComponentBuilder.of(Greeting)
      .optionalInputs({ name: "world" })
      .outputs()
      .build();
    const Host = ComponentBuilder.template("<tk-greeting></tk-greeting>")
      .directives(Greeting)
      .build();
    const ref = TestBed.override(Greeting, mock)
      .component(Host)
      .build();
    ref.root.query(Greeting)
      .setInput("name", "Ada");
    expect(ref.root.query(Greeting).inputs.name)
      .toBe("Ada");
    ref.destroy();
  });

  test("a required component input is unbound until set", () => {
    const mock = MockComponentBuilder.of(Greeting)
      .requiredInputs("name")
      .build();
    const Host = ComponentBuilder.template("<tk-greeting></tk-greeting>")
      .directives(Greeting)
      .build();
    const ref = TestBed.override(Greeting, mock)
      .component(Host)
      .build();
    expect(() => ref.root.query(Greeting).inputs.name)
      .toThrow(InputNotBoundError);
    ref.destroy();
  });

  test("a component builder refuses a class that is not a component", () => {
    expect(() => new MockComponentBuilder(class Plain {}))
      .toThrow("is not a component");
  });

  test("a directive builder refuses a component, and a plain class", () => {
    expect(() => new MockDirectiveBuilder(Item))
      .toThrow("is a component");
    expect(() => new MockDirectiveBuilder(class Plain {}))
      .toThrow("is not a directive");
  });
});

describe("text", () => {
  test("collapses the template's whitespace, unlike textContent", () => {
    const Host = ComponentBuilder.template("<p>\n    hello\n    <b>there</b>\n  </p>")
      .build();
    const ref = TestBed.component(Host)
      .build();
    const paragraph = ref.root.query("p");
    expect(paragraph.text())
      .toBe("hello there");
    expect(paragraph.element.textContent)
      .toContain("\n");
    ref.destroy();
  });
});

@Component({ selector: "tk-labelled", template: "<p>{{ shown() }}</p>" })
class Labelled {
  readonly label = input<string>();
  readonly shown = signal("");

  @Effect() sync(): void {
    this.shown.set(this.label());
  }
}

describe("inputs set before the first render", () => {
  test("a required input set by the bed is ready for an effect before the first render", () => {
    const ref = TestBed.inputs({ label: "Ada" })
      .component(Labelled)
      .build();
    expect(ref.root.text())
      .toBe("Ada");
    ref.destroy();
  });
});

@Component({ selector: "tk-promised", template: "<p>{{ text() }}</p>" })
class Promised {
  readonly text = signal("before");
}

describe("whenStable", () => {
  test("renders a write made by a promise before it resolves", async () => {
    const ref = TestBed.component(Promised)
      .build();
    Promise.resolve()
      .then(() => ref.root.instance.text.set("after"));
    await ref.whenStable();
    expect(ref.root.text())
      .toBe("after");
    ref.destroy();
  });
});

@Directive({ selector: "[bump]" })
class Bumper {
  readonly count: number = 0;

  bump(n: number): number {
    return n + 1;
  }
}

describe("mock fields and methods", () => {
  test("a field is set to the value the author gives", () => {
    const mock = new MockDirectiveBuilder(Bumper)
      .fields({ count: 5 })
      .build();
    const Host = ComponentBuilder.template("<p bump></p>")
      .directives(Bumper)
      .build();
    const ref = TestBed.override(Bumper, mock)
      .component(Host)
      .build();
    expect(ref.root.query(Bumper).instance.count)
      .toBe(5);
    ref.destroy();
  });

  test("a method passes its arguments to the implementation, and returns what it returns", () => {
    const bump = vi.fn((n: number) => n * 10);
    const mock = MockDirectiveBuilder.of(Bumper)
      .methods({ bump })
      .build();
    const Host = ComponentBuilder.template("<p bump></p>")
      .directives(Bumper)
      .build();
    const ref = TestBed.override(Bumper, mock)
      .component(Host)
      .build();
    expect(ref.root.query(Bumper).instance.bump(2))
      .toBe(20);
    expect(bump)
      .toHaveBeenCalledWith(2);
    ref.destroy();
  });

  test("a component mock's method is an implementation too", () => {
    const press = vi.fn();
    const mock = MockComponentBuilder.of(Clicker)
      .methods({ press })
      .build();
    const Host = ComponentBuilder.template("<tk-clicker></tk-clicker>")
      .directives(Clicker)
      .build();
    const ref = TestBed.override(Clicker, mock)
      .component(Host)
      .build();
    ref.root.query(Clicker).instance.press();
    expect(press)
      .toHaveBeenCalledTimes(1);
    ref.destroy();
  });
});

describe("component mock fields", () => {
  test("a component mock's field is set to the value the author gives", () => {
    const mock = MockComponentBuilder.of(Clicker)
      .fields({ clicks: signal(5) })
      .build();
    const Host = ComponentBuilder.template("<tk-clicker></tk-clicker>")
      .directives(Clicker)
      .build();
    const ref = TestBed.override(Clicker, mock)
      .component(Host)
      .build();
    expect(ref.root.query(Clicker).instance.clicks())
      .toBe(5);
    ref.destroy();
  });
});

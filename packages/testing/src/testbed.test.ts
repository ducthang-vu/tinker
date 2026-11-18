import { describe, expect, test } from "vitest";
import {
  Component,
  Directive,
  InjectionToken,
  input,
  InputNotBoundError,
  output,
  provide,
} from "@tinker/core";
import { ComponentBuilder, TestBed } from "./testbed.ts";

@Component({ selector: "tk-greeting", template: "<h1>Hello {{ name() }}</h1>" })
class Greeting {
  readonly name = input("world");
}

@Directive({ selector: "[mark]" })
class Mark {
  readonly label = input("m");
  readonly must = input<string>();
}

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

describe("TestBedRef.root", () => {
  test("setInput changes the component after detectChanges", () => {
    const ref = TestBed.component(Greeting)
      .build();
    ref.root.setInput("name", "Grace");
    ref.detectChanges();
    expect(ref.root.inputs.name)
      .toBe("Grace");
    expect(ref.root.element.textContent)
      .toBe("Hello Grace");
    ref.root.setInput("unknown", 1);
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
    mark.setInput("unknown", 1);
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
    pick.emitOutput("unknown", 4);
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

  test("mocks are not implemented yet", () => {
    expect(() => ComponentBuilder.mock(Greeting))
      .toThrow("not implemented yet");
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

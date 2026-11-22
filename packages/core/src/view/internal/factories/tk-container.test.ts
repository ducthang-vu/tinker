import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { inject } from "../../../di/index.ts";
import { Component, Directive, ElementRef, input, ViewContainerRef, queryAll } from "../../index.ts";
import { valueOrThrow } from "@tinker/functional";

@Directive({ selector: "[label]" })
class Label {
  readonly label = input("");
}

@Directive({ selector: "[hosted]", host: { "[class.on]": "true" } })
class Hosted {}

@Directive({ selector: "[here]" })
class Here {
  readonly container = inject(ViewContainerRef);
}

@Component({ selector: "[boxed]", template: "<i>boxed</i>" })
class Boxed {}

@Component({ selector: "tk-tagged", template: "<span>tagged</span>" })
class Tagged {}

describe("<tk-container>", () => {
  test("renders its content, and its directives get the container without an element", async () => {
    @Component({
      selector: "tk-with-container",
      template: "<p>before</p><tk-container label=\"x\"><b>inside</b></tk-container><p>after</p>",
      imports: [Label],
    })
    class WithContainer {}
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(WithContainer, { host: el }));
    await tick();
    await tick();
    expect(el.textContent)
      .toBe("beforeinsideafter");
    expect(el.querySelector("tk-container"))
      .toBeNull();
    app.destroy();
  });

  test("a container with no directive renders its content, and nothing is left behind", async () => {
    @Component({
      selector: "tk-plain-container",
      template: "<p>before</p><tk-container><b>inside</b></tk-container><p>after</p>",
    })
    class PlainContainer {}
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(PlainContainer, { host: el }));
    await tick();
    await tick();
    expect(el.textContent)
      .toBe("beforeinsideafter");
    app.destroy();
  });

  test("a directive with an input on a container gets the input's value", async () => {
    @Component({
      selector: "tk-input-container",
      template: "<tk-container [label]=\"text()\"></tk-container>",
      imports: [Label],
    })
    class InputContainer {
      readonly text = signal("bound");
      readonly label = queryAll(Label);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(InputContainer, { host: el }));
    await tick();
    await tick();
    expect(app.root.instance.label()[0]!.label())
      .toBe("bound");
    app.destroy();
  });

  test("a directive on a container that needs an element is an error", () => {
    @Component({
      selector: "tk-hosted-container",
      template: "<tk-container hosted></tk-container>",
      imports: [Hosted],
    })
    class HostedContainer {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(HostedContainer, document.createElement("section")))

      .toThrow("has host bindings, so it needs an element");
  });

  test("a container cannot have bindings on an element, a component, or a #name", async () => {
    const attempt = (template: string) => {
      @Component({ selector: "tk-bad-container", template, imports: [Boxed] })
      class BadContainer {}
      return () => bootstrap(BadContainer, { host: document.createElement("section") });
    };
    await tick();
    expect(attempt("<tk-container [class.x]=\"true\"></tk-container>"))
      .toThrow("a container has no element");
    expect(attempt("<tk-container (click)=\"go()\"></tk-container>"))
      .toThrow("a container has no element");
    expect(attempt("<tk-container #here></tk-container>"))
      .toThrow("a container has no element to name");
    expect(attempt("<tk-container [style.color]=\"'red'\"></tk-container>"))
      .toThrow("a container has no element");
    expect(attempt("<tk-container [attr.title]=\"'x'\"></tk-container>"))
      .toThrow("a container has no element");
    expect(attempt("<tk-container boxed></tk-container>"))
      .toThrow("cannot hold a component");
  });

  test("queryAll lists a container's directive, and read: ElementRef leaves it out", async () => {
    @Component({
      selector: "tk-listed-container",
      template: "<tk-container label=\"a\"></tk-container>",
      imports: [Label],
    })
    class ListedContainer {
      readonly labels = queryAll(Label);
      readonly elements = queryAll(Label, { read: ElementRef });
    }
    const app = valueOrThrow(bootstrap(ListedContainer, { host: document.createElement("section") }));
    await tick();
    expect(app.root.instance.labels())
      .toHaveLength(1);
    expect(app.root.instance.elements())
      .toHaveLength(0);
    app.destroy();
  });

  test("a directive on a container injects its ViewContainerRef, and can create a component there", async () => {
    @Component({
      selector: "tk-creating-container",
      template: "<tk-container here></tk-container>",
      imports: [Here],
    })
    class CreatingContainer {
      readonly here = queryAll(Here);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(CreatingContainer, { host: el }));
    await tick();
    const container = app.root.instance.here()[0]!.container;
    container.createComponent(Tagged);
    expect(el.querySelector("tk-tagged"))
      .not.toBeNull();
    expect(container.length)
      .toBe(1);
    app.destroy();
  });
});

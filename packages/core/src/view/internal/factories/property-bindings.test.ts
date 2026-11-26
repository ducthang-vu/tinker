import { afterEach, describe, expect, test } from "vitest";
import { Component, Directive } from "../authoring/decorators.ts";
import { input } from "../authoring/input.ts";
import { Engine } from "../engine.ts";
import { signal } from "../../../signals/index.ts";
import { renderComponent } from "../test-support.ts";
import { getOrElse, map, valueOrThrow } from "@tinker/functional";
import { Sanitizer, TrustedHtml } from "../runtime/sanitization.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("property bindings on plain elements", () => {
  test("[value] sets the DOM property, and leaves the value attribute alone", () => {
    @Component({ selector: "tk-form", template: `<input [value]="draft()">` })
    class Form {
      readonly draft = signal("a");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Form));
    const field = view.host.nativeElement.querySelector("input")!;
    engine.flush();
    expect(field.value)
      .toBe("a");
    expect(field.hasAttribute("value"))
      .toBe(false);

    view.instance.draft.set("b");
    engine.flush();
    expect(field.value)
      .toBe("b");
  });

  test("a property name is matched case-insensitively, since the parser lowercases it", () => {
    @Component({ selector: "tk-label", template: `<p [textContent]="text()"></p>` })
    class Label {
      readonly text = signal("hello");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Label));
    engine.flush();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("hello");
  });

  test("a boolean property is set as the expression gives it", () => {
    @Component({ selector: "tk-button", template: `<button [disabled]="off()">go</button>` })
    class Button {
      readonly off = signal(true);
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Button));
    const button = view.host.nativeElement.querySelector("button")!;
    engine.flush();
    // The `disabled` property reflects to the attribute, so the attribute follows it.
    expect(button.disabled)
      .toBe(true);

    view.instance.off.set(false);
    engine.flush();
    expect(button.disabled)
      .toBe(false);
  });

  test("an input of that name wins over the DOM property", () => {
    @Directive({ selector: "[field]" })
    class Field {
      readonly value = input("");
    }
    @Component({
      selector: "tk-field-host",
      template: `<input field [value]="text()">`,
      imports: [Field],
    })
    class FieldHost {
      readonly text = signal("typed");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, FieldHost));
    const field = view.host.nativeElement.querySelector("input")!;
    engine.flush();
    expect(field.value)
      .toBe("");
    const [directive] = getOrElse(
      map(engine.getContext(field), (context) => context.directives),
      [],
    ) as [Field];
    expect(directive!.value())
      .toBe("typed");
  });

  test("a name that is neither an input nor a DOM property is an error", () => {
    @Component({ selector: "tk-bad", template: `<p [nope]="text()">x</p>` })
    class Bad {
      readonly text = signal("t");
    }
    const engine = Engine.create();
    expect(() => valueOrThrow(renderComponent(engine, Bad)))
      .toThrow(
        `[nope] on <p>: no directive or component on this element has an input "nope", and <p> has no DOM property "nope" either`,
      );
  });
});

describe("properties that cannot be bound", () => {
  test.each([
    ["click", "a method of the element"],
    ["onclick", "an event handler"],
    ["tagName", "a read-only property"],
    ["__proto__", "a member of Object.prototype"],
  ])("[%s] is an error: %s", (name) => {
    @Component({ selector: "tk-bad", template: `<button [${name}]="v()">x</button>` })
    class Bad {
      readonly v = signal<unknown>(1);
    }
    const engine = Engine.create();
    expect(() => valueOrThrow(renderComponent(engine, Bad)))
      .toThrow(`[${name}] on <button>: no directive or component on this element has an input`);
  });

  test("a writable property of the element still binds", () => {
    @Component({ selector: "tk-ok", template: `<button [title]="v()">x</button>` })
    class Ok {
      readonly v = signal("hint");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Ok));
    engine.flush();
    expect(view.host.nativeElement.querySelector("button")!.title)
      .toBe("hint");
  });
});

describe("the sanitizer applies to properties", () => {
  test("a [href] to javascript: is not a live link; a trusted URL is set", () => {
    @Component({ selector: "tk-links", template: `<a [href]="unsafe()">x</a><a [href]="trusted()">y</a>` })
    class Links {
      readonly unsafe = signal("javascript:alert(1)");
      readonly trusted = signal(new Sanitizer()
        .trustUrl("javascript:void(0)"));
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Links));
    engine.flush();
    const [unsafe, trusted] = Array.from(view.host.nativeElement.querySelectorAll("a")) as HTMLAnchorElement[];
    expect(unsafe!.getAttribute("href"))
      .toBe("");
    expect(trusted!.getAttribute("href"))
      .toBe("javascript:void(0)");
  });

  test("[innerHTML] sets nothing unless the HTML is trusted", () => {
    @Component({ selector: "tk-html", template: `<p [innerHTML]="html()"></p>` })
    class Html {
      readonly html = signal<string | TrustedHtml>("<img src=x onerror=alert(1)>");
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, Html));
    engine.flush();
    expect(view.host.nativeElement.querySelector("p")!.innerHTML)
      .toBe("");
  });

  test("[innerHTML] with trusted HTML sets it", () => {
    @Component({ selector: "tk-trusted-html", template: `<p [innerHTML]="html()"></p>` })
    class TrustedHtmlHost {
      readonly html = signal(new Sanitizer()
        .trustHtml("<b>ok</b>"));
    }
    const engine = Engine.create();
    const view = valueOrThrow(renderComponent(engine, TrustedHtmlHost));
    engine.flush();
    expect(view.host.nativeElement.querySelector("p")!.innerHTML)
      .toBe("<b>ok</b>");
  });
});

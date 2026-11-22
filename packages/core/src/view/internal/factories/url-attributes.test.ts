import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { Sanitizer } from "../runtime/sanitization.ts";
import { HostBindings } from "./host-bindings.ts";
import { match, Left, Right, valueOrThrow, getOrElse, map, use } from "@tinker/functional";

/** Render `<a [attr.name]="value()">` for `value`, and return the attribute `attribute`. */
function attributeFor(attribute: string, value: string | null): string | null {
  @Component({
    selector: "tk-link",
    template: `<a [attr.${attribute}]="value()">x</a>`,
  })
  class Link {
    readonly value = signal<string | null>(value);
  }
  const el = document.createElement("section");
  const engine = Engine.create();
  const app = valueOrThrow(engine.bootstrap(Link, el));
  engine.flush();
  const result = el.querySelector("a")!.getAttribute(attribute);
  app.destroy();
  return result;
}

describe("URL attributes", () => {
  test("a trusted URL is set, though it is unsafe; its text is the URL in interpolation", () => {
    @Component({
      selector: "tk-trusted",
      template: `<a [attr.href]="link">{{ link }}</a>`,
    })
    class Trusted {
      readonly link = new Sanitizer()
        .trustUrl("javascript:void(0)");
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(Trusted, el));
    engine.flush();
    const a = el.querySelector("a")!;
    expect(a.getAttribute("href"))
      .toBe("javascript:void(0)");
    expect(a.textContent)
      .toBe("javascript:void(0)");
    app.destroy();
  });

  test("a safe URL is set", () => {
    expect(attributeFor("href", "https://example.com"))
      .toBe("https://example.com");
    expect(attributeFor("href", "mailto:a@b.c"))
      .toBe("mailto:a@b.c");
  });

  test("an unsafe URL is not set at all", () => {
    expect(attributeFor("href", "javascript:alert(1)"))
      .toBeNull();
    expect(attributeFor("src", "data:text/html,<b>x</b>"))
      .toBeNull();
  });

  test("a non-URL attribute is set as it is", () => {
    expect(attributeFor("title", "javascript:not-a-link"))
      .toBe("javascript:not-a-link");
  });
});

describe("host attribute bindings to URL attributes", () => {
  test("a directive's [attr.href] follows its signal, and an unsafe URL removes it", () => {
    @Directive({ selector: "[link]", host: { "[attr.href]": "url()" } })
    class Link {
      readonly url = signal<string | undefined>("https://example.com/");
    }
    @Component({ selector: "tk-links", template: "<a link>x</a>", imports: [Link] })
    class Links {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Links));
    const a = view.host.nativeElement.querySelector("a")!;
    engine.flush();
    expect(a.getAttribute("href"))
      .toBe("https://example.com/");

    const [link] = getOrElse(
      map(engine.getContext(a), (context) => context.directives),
      [],
    ) as [Link];
    link!.url.set("javascript:alert(1)");
    engine.flush();
    expect(a.hasAttribute("href"))
      .toBe(false);

    link!.url.set("/relative");
    engine.flush();
    expect(a.getAttribute("href"))
      .toBe("/relative");
  });

  test("a component's [attr.href] on its own host element is checked the same way", () => {
    @Component({
      selector: "tk-card",
      template: "<p>x</p>",
      host: { "[attr.href]": "url()" },
    })
    class Card {
      readonly url = signal("javascript:alert(1)");
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(Card, el));
    engine.flush();
    expect(el.hasAttribute("href"))
      .toBe(false);
    app.destroy();
  });
});

describe("event attributes cannot be bound", () => {
  test("a template binding to an on… attribute is an error naming the event binding", () => {
    @Component({ selector: "tk-bad", template: `<button [attr.onclick]="code()">x</button>` })
    class Bad {
      readonly code = signal("alert(1)");
    }
    const el = document.createElement("section");
    const engine = Engine.create();

    expect(() => engine.bootstrap(Bad, el))

      .toThrow("[attr.onclick] on <button>: event attributes cannot be bound; use (click) instead");
  });

  test("a host binding to an on… attribute is refused the same way", () => {
    expect(() => valueOrThrow(HostBindings.parse({ "[attr.onclick]": "code()" })))
      .toThrow("[attr.onclick] in host binding \"[attr.onclick]\": event attributes cannot be bound");
  });
});

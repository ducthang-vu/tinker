import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";
import { HostBindings } from "./host-bindings.ts";

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
  const app = bootstrap(Link, { host: el });
  const result = el.querySelector("a")!.getAttribute(attribute);
  app.destroy();
  return result;
}

describe("URL attributes", () => {
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

describe("event attributes cannot be bound", () => {
  test("a template binding to an on… attribute is an error naming the event binding", () => {
    @Component({ selector: "tk-bad", template: `<button [attr.onclick]="code()">x</button>` })
    class Bad {
      readonly code = signal("alert(1)");
    }
    const el = document.createElement("section");
    expect(() => bootstrap(Bad, { host: el }))
      .toThrow("[attr.onclick] on <button>: event attributes cannot be bound; use (click) instead");
  });

  test("a host binding to an on… attribute is refused the same way", () => {
    expect(() => new HostBindings({ "[attr.onclick]": "code()" }))
      .toThrow("[attr.onclick] in host binding \"[attr.onclick]\": event attributes cannot be bound");
  });
});

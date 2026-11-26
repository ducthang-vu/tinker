import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { Component } from "../authoring/decorators.ts";
import { inject } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { HostBindings } from "../factories/host-bindings.ts";
import { attributeText, propertyValue, refusalOf, Sanitizer, styleText, TrustedHtml, TrustedStyle, TrustedUrl } from "./sanitization.ts";

const sanitizer = new Sanitizer();
import { valueOrThrow } from "@tinker/functional";

describe("trusted values", () => {
  test("each trust function makes a value of its own kind, whose text is its content", () => {
    expect(sanitizer.trustUrl("u"))
      .toBeInstanceOf(TrustedUrl);
    expect(sanitizer.trustHtml("<b>h</b>"))
      .toBeInstanceOf(TrustedHtml);
    expect(sanitizer.trustStyle("color: red"))
      .toBeInstanceOf(TrustedStyle);
    expect(String(sanitizer.trustUrl("u")))
      .toBe("u");
    expect(String(sanitizer.trustHtml("<b>h</b>")))
      .toBe("<b>h</b>");
    expect(String(sanitizer.trustStyle("color: red")))
      .toBe("color: red");
  });
});

describe("attributeText", () => {
  test("null, undefined and false remove the attribute; true sets it empty", () => {
    expect([attributeText("title", null), attributeText("title", undefined), attributeText("title", false)])
      .toEqual([undefined, undefined, undefined]);
    expect(attributeText("title", true))
      .toBe("");
  });

  test("a plain value of an attribute that is not special is its text", () => {
    expect(attributeText("title", "Hello"))
      .toBe("Hello");
    expect(attributeText("title", 3))
      .toBe("3");
  });

  test("srcdoc is set only from a TrustedHtml", () => {
    expect(attributeText("srcdoc", "<script>alert(1)</script>"))
      .toBeUndefined();
    expect(attributeText("srcdoc", sanitizer.trustHtml("<b>x</b>")))
      .toBe("<b>x</b>");
  });

  test("style as an attribute is set only from a TrustedStyle", () => {
    expect(attributeText("style", "background:url(https://evil.example/x)"))
      .toBeUndefined();
    expect(attributeText("style", sanitizer.trustStyle("color: red")))
      .toBe("color: red");
  });

  test("a URL attribute keeps a safe URL, and removes an unsafe one, unless it is trusted", () => {
    expect(attributeText("href", "https://example.com"))
      .toBe("https://example.com");
    expect(attributeText("href", "javascript:alert(1)"))
      .toBeUndefined();
    expect(attributeText("href", sanitizer.trustUrl("javascript:void(0)")))
      .toBe("javascript:void(0)");
  });

  test("the URL attributes that were not checked before are checked", () => {
    for (const name of ["background", "codebase", "data", "icon", "classid"]) {
      expect(attributeText(name, "javascript:alert(1)"), name)
        .toBeUndefined();
      expect(attributeText(name, "https://example.com/x"), name)
        .toBe("https://example.com/x");
    }
  });

  test("srcset checks each of its candidates", () => {
    expect(attributeText("srcset", "a.png 1x, b.png 2x"))
      .toBe("a.png 1x, b.png 2x");
    expect(attributeText("srcset", "a.png 1x, javascript:alert(1) 2x"))
      .toBeUndefined();
  });

  test("ping checks each of its URLs", () => {
    expect(attributeText("ping", "https://a.example/x https://b.example/y"))
      .toBe("https://a.example/x https://b.example/y");
    expect(attributeText("ping", "https://a.example/x javascript:alert(1)"))
      .toBeUndefined();
  });

  test("the name is matched without regard to case", () => {
    expect(attributeText("SrcDoc", "<b>x</b>"))
      .toBeUndefined();
  });
});

describe("styleText", () => {
  test("empty values remove the property; a plain value is its text", () => {
    expect([styleText(null), styleText(undefined), styleText(false), styleText("")])
      .toEqual([undefined, undefined, undefined, undefined]);
    expect(styleText("red"))
      .toBe("red");
    expect(styleText(true))
      .toBe("true");
    expect(styleText(2))
      .toBe("2");
  });

  test("a value that loads a URL or runs an expression is removed, in any form", () => {
    for (const value of ["url(https://evil.example/x)", "url (x)", "image(a.png)", "image-set(a.png 1x)", "src(x)", "expression(alert(1))", "u\\72l(x)"]) {
      expect(styleText(value), value)
        .toBeUndefined();
    }
  });

  test("a TrustedStyle property is set, whatever it says", () => {
    expect(styleText(sanitizer.trustStyle("url(https://a.example/x)")))
      .toBe("url(https://a.example/x)");
  });
});

describe("refusalOf", () => {
  test("event attributes, xmlns and is cannot be bound", () => {
    expect(refusalOf("onclick"))
      .toBe("event attributes cannot be bound; use (click) instead");
    expect(refusalOf("xmlns"))
      .toBe("xmlns cannot be bound: it changes how the element is built");
    expect(refusalOf("is"))
      .toBe("is cannot be bound: it changes how the element is built");
  });

  test("any other attribute can be bound", () => {
    expect(refusalOf("title"))
      .toBeUndefined();
  });
});

describe("sanitization in a view", () => {
  test("a bound srcdoc, style or unchecked URL attribute is not set, and a trusted one is", () => {
    @Component({
      selector: "tk-sanitized",
      template: `<iframe [attr.srcdoc]="doc()"></iframe><p [attr.style]="css()"></p><i [attr.background]="bg()"></i>`,
    })
    class Sanitized {
      readonly doc = signal<unknown>("<script>alert(1)</script>");
      readonly css = signal<unknown>("color: red");
      readonly bg = signal<unknown>("javascript:alert(1)");
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(Sanitized, el));
    engine.flush();
    expect(el.querySelector("iframe")!.hasAttribute("srcdoc"))
      .toBe(false);
    expect(el.querySelector("p")!.hasAttribute("style"))
      .toBe(false);
    expect(el.querySelector("i")!.hasAttribute("background"))
      .toBe(false);
    app.destroy();
  });

  test("a style property that loads a URL is not set; a trusted one is", () => {
    @Component({
      selector: "tk-styled",
      template: `<p [style.background]="bg()" [style.color]="color()"></p>`,
    })
    class Styled {
      readonly bg = signal<unknown>("url(https://evil.example/x)");
      readonly color = signal<unknown>(sanitizer.trustStyle("red"));
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(Styled, el));
    engine.flush();
    const p = el.querySelector("p")!;
    expect(p.style.getPropertyValue("background"))
      .toBe("");
    expect(p.style.getPropertyValue("color"))
      .toBe("red");
    app.destroy();
  });

  test("a template binding to xmlns or is is an error, as an event binding is", () => {
    @Component({ selector: "tk-bad-xmlns", template: `<div [attr.xmlns]="ns()">x</div>` })
    class BadXmlns {
      readonly ns = signal("http://www.w3.org/1999/xhtml");
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    expect(() => valueOrThrow(engine.bootstrap(BadXmlns, el)))
      .toThrow("[attr.xmlns] on <div>: xmlns cannot be bound: it changes how the element is built");
  });

  test("a host binding to is is refused", () => {
    expect(() => valueOrThrow(HostBindings.parse({ "[attr.is]": "name()" })))
      .toThrow("[attr.is] in host binding \"[attr.is]\": is cannot be bound");
  });
});

describe("the Sanitizer service", () => {
  test("a component injects it, and binds the value it trusts", () => {
    @Component({ selector: "tk-logo", template: `<img [attr.src]="logo">` })
    class Logo {
      readonly logo = inject(Sanitizer)
        .trustUrl("data:image/png;base64,AAAA");
    }
    const el = document.createElement("section");
    const engine = Engine.create();
    const app = valueOrThrow(engine.bootstrap(Logo, el));
    engine.flush();
    expect(el.querySelector("img")!.getAttribute("src"))
      .toBe("data:image/png;base64,AAAA");
    app.destroy();
  });
});

describe("propertyValue", () => {
  test("innerHTML, outerHTML and srcdoc take only a TrustedHtml; anything else is \"\"", () => {
    expect(propertyValue("innerHTML", sanitizer.trustHtml("<b>ok</b>")))
      .toBe("<b>ok</b>");
    expect(propertyValue("outerHTML", "<img src=x>"))
      .toBe("");
    expect(propertyValue("srcdoc", null))
      .toBe("");
  });

  test("style takes only a TrustedStyle", () => {
    expect(propertyValue("style", sanitizer.trustStyle("color: red")))
      .toBe("color: red");
    expect(propertyValue("style", "background:url(https://evil.example/x)"))
      .toBe("");
  });

  test("a URL property takes a trusted URL, a safe one, and nothing else", () => {
    expect(propertyValue("href", sanitizer.trustUrl("javascript:void(0)")))
      .toBe("javascript:void(0)");
    expect(propertyValue("href", "https://example.com"))
      .toBe("https://example.com");
    expect(propertyValue("href", "javascript:alert(1)"))
      .toBe("");
    expect(propertyValue("src", undefined))
      .toBe("");
    expect(propertyValue("src", false))
      .toBe("");
  });

  test("other properties are set as they are, a trusted value as its text", () => {
    expect(propertyValue("value", "typed"))
      .toBe("typed");
    expect(propertyValue("disabled", true))
      .toBe(true);
    expect(propertyValue("textContent", sanitizer.trustUrl("https://a.example/")))
      .toBe("https://a.example/");
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { Component } from "../authoring/decorators.ts";
import { Engine } from "../engine.ts";
import { scopeStyles, styleScopeOf } from "./component-styles.ts";
import { valueOrThrow } from "@tinker/functional/v1";

const scope = { attribute: "tk-c1", hostAttribute: "tk-h1" };
/** The scoped CSS, without its whitespace, so the layout of the output does not matter. */
const squash = (css: string) => css.replace(/\s/g, "");
const scoped = (css: string) => scopeStyles(css, scope)
  .replace(/\s/g, "");

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-tk-style]")
    .forEach((style) => style.remove());
});

describe("scopeStyles", () => {
  test("marks the last compound of each selector with the component's attribute", () => {
    expect(scoped("p { color: red } .card > b:hover, .x p::before { x: 1 }"))
      .toBe(squash("p[tk-c1]{ color: red } .card > b[tk-c1]:hover, .x p[tk-c1]::before{ x: 1 }"));
  });

  test("keeps attribute values and :not(...) whole", () => {
    expect(scoped(`a:not(.x), [title="a, b"] { }`))
      .toBe(squash(`a[tk-c1]:not(.x), [title="a, b"][tk-c1] { }`));
    expect(scoped(`[data-x=":hover"]:hover { }`))
      .toBe(squash(`[data-x=":hover"][tk-c1]:hover { }`));
  });

  test(":host is the host element, which carries the host attribute", () => {
    expect(scoped(":host { display: block }"))
      .toBe(squash("[tk-h1] { display: block }"));
    expect(scoped(":host:hover { }"))
      .toBe(squash("[tk-h1]:hover { }"));
    expect(scoped(":host(.big) p { }"))
      .toBe(squash("[tk-h1].big p[tk-c1] { }"));
    expect(scoped(":host .x:hover { }"))
      .toBe(squash("[tk-h1] .x[tk-c1]:hover { }"));
  });

  test("scopes the rules inside @media and @supports, and copies @keyframes as they are", () => {
    expect(scoped("@media (max-width: 600px) { p { x: 1 } }"))
      .toBe(squash("@media (max-width: 600px) { p[tk-c1] { x: 1 } }"));
    expect(scoped("@supports (display: grid) { .g { x: 1 } }"))
      .toBe(squash("@supports (display: grid) { .g[tk-c1] { x: 1 } }"));
    const keyframes = "@keyframes spin { from { transform: none } to { transform: none } }";
    expect(scoped(keyframes))
      .toBe(keyframes.replace(/\s/g, ""));
  });

  test("braces and semicolons inside quotes do not end a rule", () => {
    expect(scoped(`p { content: "}"; quotes: '{' }`))
      .toBe(squash(`p[tk-c1] { content: "}"; quotes: '{' }`));
  });

  test(":deep(...) leaves its part unscoped, and scopes what is before it", () => {
    expect(scoped(".card :deep(.title) { }"))
      .toBe(squash(".card[tk-c1] .title { }"));
    expect(scoped(".card :deep(.title):hover { }"))
      .toBe(squash(".card[tk-c1] .title:hover { }"));
    expect(scoped(".card > :deep(.title) { }"))
      .toBe(squash(".card > *[tk-c1] .title { }"));
    expect(scoped(":deep(.title) { }"))
      .toBe(squash("[tk-h1] .title { }"));
    expect(scoped(":host(.big) :deep(p) { }"))
      .toBe(squash("[tk-h1].big p { }"));
    expect(scoped(".card :deep(.title { }"))
      .toBe(squash(".card[tk-c1] .title { }"));
    expect(scoped(":deep(.a(b)) { }"))
      .toBe(squash("[tk-h1] .a(b) { }"));
    expect(scoped("@media (x) { .card :deep(.title) { } }"))
      .toBe(squash("@media (x) { .card[tk-c1] .title { } }"));
  });

  test("a block that is never closed takes the rest of the sheet", () => {
    expect(scoped("p { color: red"))
      .toBe(squash("p[tk-c1] { color: red }"));
  });

  test("keeps statements such as @import, and drops comments", () => {
    expect(scoped(`@import url("x.css"); /* note */ p { }`))
      .toBe(squash(`@import url("x.css"); p[tk-c1] { }`));
  });

  test("a component's attribute is per class, and the same for the same class", () => {
    class One {}
    class Two {}
    expect(styleScopeOf(One))
      .toEqual(styleScopeOf(One));
    expect(styleScopeOf(One).attribute)
      .not.toBe(styleScopeOf(Two).attribute);
  });
});

describe("component styles in a view", () => {
  test("the stylesheet is removed with the last instance, and added again by the next", () => {
    @Component({ selector: "tk-gone", template: "<p>a</p>", styles: "p { color: red }" })
    class Gone {}
    const engine = Engine.create();
    const first = valueOrThrow(engine.createComponent(Gone));
    const second = valueOrThrow(engine.createComponent(Gone));
    const { attribute } = styleScopeOf(Gone);
    const sheet = () => document.head.querySelector(`style[data-tk-style="${attribute}"]`);
    first.destroy();
    expect(sheet())
      .not.toBeNull();
    second.destroy();
    expect(sheet())
      .toBeNull();
    valueOrThrow(engine.createComponent(Gone));
    expect(sheet())
      .not.toBeNull();
  });

  test("the component's elements carry its attribute, its host the host attribute", () => {
    @Component({ selector: "tk-styled", template: "<p>a</p>", styles: "p { color: red }" })
    class Styled {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Styled));
    const styled = styleScopeOf(Styled);
    expect(view.host.nativeElement.hasAttribute(styled.hostAttribute))
      .toBe(true);
    expect(view.host.nativeElement.querySelector("p")!.hasAttribute(styled.attribute))
      .toBe(true);
  });

  test("the rules are added once to the head, with the scoped selectors", () => {
    @Component({ selector: "tk-once", template: "<p>a</p>", styles: "p { color: red }" })
    class Once {}
    const engine = Engine.create();
    engine.createComponent(Once);
    engine.createComponent(Once);
    const { attribute } = styleScopeOf(Once);
    const sheets = document.head.querySelectorAll(`style[data-tk-style="${attribute}"]`);
    expect(sheets)
      .toHaveLength(1);
    expect(squash(sheets[0]!.textContent ?? ""))
      .toBe(squash(`p[${attribute}] { color: red }`));
  });

  test("styles do not reach the elements of a child component's template", () => {
    @Component({ selector: "tk-leaf", template: "<p>leaf</p>" })
    class Leaf {}
    @Component({
      selector: "tk-parent",
      template: "<p>own</p><tk-leaf></tk-leaf>",
      styles: "p { color: red }",
      imports: [Leaf],
    })
    class Parent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Parent));
    const { attribute, hostAttribute } = styleScopeOf(Parent);
    const own = view.host.nativeElement.querySelector("p")!;
    const leaf = view.host.nativeElement.querySelector("tk-leaf")!;
    expect(own.hasAttribute(attribute))
      .toBe(true);
    expect(leaf.hasAttribute(attribute))
      .toBe(true);
    expect(leaf.querySelector("p")!.hasAttribute(attribute))
      .toBe(false);
    expect(leaf.hasAttribute(hostAttribute))
      .toBe(false);
  });

  test(":deep(...) in a parent's styles reaches the elements of a child's template", () => {
    @Component({ selector: "tk-deep-leaf", template: `<p class="title">leaf</p>` })
    class DeepLeaf {}
    @Component({
      selector: "tk-deep-parent",
      template: `<div class="card"><tk-deep-leaf></tk-deep-leaf></div>`,
      styles: ".card :deep(.title) { color: red }",
      imports: [DeepLeaf],
    })
    class DeepParent {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(DeepParent));
    const { attribute } = styleScopeOf(DeepParent);
    const title = view.host.nativeElement.querySelector("p.title")!;
    expect(title.hasAttribute(attribute))
      .toBe(false);
    const sheet = document.head.querySelector(`style[data-tk-style="${attribute}"]`)!;
    expect(squash(sheet.textContent ?? ""))
      .toBe(squash(`.card[${attribute}] .title { color: red }`));
  });

  test("a component without styles adds no attributes and no stylesheet", () => {
    @Component({ selector: "tk-plain", template: "<p>a</p>" })
    class Plain {}
    const engine = Engine.create();
    const view = valueOrThrow(engine.createComponent(Plain));
    expect(view.host.nativeElement.querySelector("p")!.attributes)
      .toHaveLength(0);
    expect(document.head.querySelectorAll("style[data-tk-style]"))
      .toHaveLength(0);
  });
});

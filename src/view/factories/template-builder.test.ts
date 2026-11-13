import { describe, expect, test, vi } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { DomRenderer } from "../renderer.ts";
import { BrowserTemplateParser } from "../template/browser-parser.ts";
import { compileTemplate } from "../template/compile.ts";
import { BindingFactory } from "../runtime/text-binding.ts";
import { RENDERER } from "../tokens.ts";
import { TemplateBuilder, TemplateBuilderFactory } from "./template-builder.ts";

/** A BindingFactory using `renderer`, created the way the engine creates it. */
function bindingFactory(renderer: DomRenderer): BindingFactory {
  const { injector } = Injector.create({ providers: [provide(RENDERER, { useValue: renderer }), BindingFactory] });
  return runInInjectionContext(injector, () => inject(BindingFactory));
}

/** Build `source` for `component`, inside a <div> to read the result. */
function build(source: string, component: object) {
  const renderer = new DomRenderer();
  const template = new TemplateBuilder(component, renderer, bindingFactory(renderer));
  const root = document.createElement("div");
  root.append(...template.build(compileTemplate(new BrowserTemplateParser().parse(source))));
  return { template, root };
}

describe("TemplateBuilder", () => {
  test("builds elements, attributes and static text", () => {
    const { root } = build(`<p class="x">hi <b>there</b></p>`, {});
    expect(root.innerHTML).toBe(`<p class="x">hi <b>there</b></p>`);
  });

  test("{{ }} texts start empty and are filled by update, at any depth", () => {
    const count = signal(1);
    const { template, root } = build("<p>{{ count() }}<b>{{ count() }}</b></p>{{ count() }}", { count });
    expect(root.textContent).toBe("");
    template.update();
    expect(root.textContent).toBe("111");
    count.set(2);
    template.update();
    expect(root.textContent).toBe("222");
  });

  test("update with no bindings does nothing", () => {
    const { template, root } = build("<p>static</p>", {});
    template.update();
    expect(root.innerHTML).toBe("<p>static</p>");
  });

  test("rejects attribute bindings, which are not supported yet", () => {
    expect(() => build(`<button (click)="go()">go</button>`, {})).toThrow(
      `Bindings are not supported yet: "(click)" on <button>`,
    );
    expect(() => build(`<p [title]="t">x</p>`, {})).toThrow(`"[title]" on <p>`);
  });
});

describe("TemplateBuilderFactory", () => {
  test("creates builders that use the app's renderer", () => {
    const renderer = new DomRenderer();
    const createText = vi.spyOn(renderer, "createText");
    const { injector } = Injector.create({
      providers: [provide(RENDERER, { useValue: renderer }), BindingFactory, TemplateBuilderFactory],
    });
    const builder = runInInjectionContext(injector, () => inject(TemplateBuilderFactory)).create({ name: "Ada" });

    expect(builder).toBeInstanceOf(TemplateBuilder);
    const [text] = builder.build(compileTemplate([{ kind: "text", value: "Hi {{ name }}" }]));
    builder.update();
    expect(text!.textContent).toBe("Hi Ada");
    expect(createText).toHaveBeenCalled();
  });
});

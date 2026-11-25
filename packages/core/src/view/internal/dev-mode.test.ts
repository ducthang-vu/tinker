import { describe, expect, test, vi } from "vitest";
import { inject, provide } from "../../di/index.ts";
import { signal } from "../../signals/index.ts";
import { Component } from "./authoring/decorators.ts";
import { Sanitizer } from "./runtime/sanitization.ts";
import { Engine } from "./engine.ts";
import { renderComponent, tick } from "./test-support.ts";
import { DEV_MODE } from "./tokens.ts";
import { valueOrThrow } from "@tinker/functional";

describe("DEV_MODE", () => {
  test("is off without the compiler's build constant, and a provider can set it", () => {
    expect(Engine.create()
      .get(DEV_MODE))
      .toBe(false);
    expect(Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] })
      .get(DEV_MODE))
      .toBe(true);
  });
});

describe("dev-mode checks in templates", () => {
  @Component({
    selector: "tk-checked",
    template: `<p>{{ tittle }}</p><p>{{ total }}</p>@let total = count() * 2;`,
  })
  class Checked {
    readonly title = signal("x");
    readonly count = signal(1);
    total = 0;
  }

  test("in development mode, an unknown name and a @let that hides a member are warned about", () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const engine = Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] });
    valueOrThrow(engine.bootstrap(Checked, document.createElement("section")));
    engine.flush();
    expect(warn)
      .toHaveBeenCalledWith("The template reads \"tittle\", which Checked does not have");
    expect(warn)
      .toHaveBeenCalledWith("@let total hides the Checked member of the same name: the template reads the @let");
    warn.mockRestore();
  });

  test("outside development mode, nothing is warned about", () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const engine = Engine.create();
    valueOrThrow(engine.bootstrap(Checked, document.createElement("section")));
    engine.flush();
    expect(warn)
      .not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("trusted values in development mode", () => {
  @Component({
    selector: "tk-links",
    template: `<a [attr.href]="link"></a><i [style.color]="css"></i><b [attr.title]="plain"></b>`,
  })
  class Links {
    readonly link = inject(Sanitizer)
      .trustUrl("javascript:go()");

    readonly css = inject(Sanitizer)
      .trustStyle("red");

    readonly plain = "ok";
  }

  test("in development mode, an attribute or a style set to a trusted value is warned about", async () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const engine = Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] });
    const view = valueOrThrow(renderComponent(engine, Links));
    await tick();
    expect(warn)
      .toHaveBeenCalledWith("attribute href on <a> holds a trusted value: its checks are bypassed");
    expect(warn)
      .toHaveBeenCalledWith("style color on <i> holds a trusted value: its checks are bypassed");
    expect(warn)
      .not.toHaveBeenCalledWith(expect.stringContaining("title"));
    expect(view.host.nativeElement.querySelector("a")!.getAttribute("href"))
      .toBe("javascript:go()");
    warn.mockRestore();
  });

  test("outside development mode, a trusted value is set and nothing is warned about", async () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const view = valueOrThrow(renderComponent(Engine.create(), Links));
    await tick();
    expect(warn)
      .not.toHaveBeenCalled();
    expect(view.host.nativeElement.querySelector("a")!.getAttribute("href"))
      .toBe("javascript:go()");
    warn.mockRestore();
  });
});

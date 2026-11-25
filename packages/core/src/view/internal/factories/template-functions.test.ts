import { afterEach, describe, expect, test } from "vitest";
import { inject, Injectable } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { Component } from "../authoring/decorators.ts";
import { TemplateFunction, type TemplateFunctionContract } from "../authoring/template-function.ts";
import { Engine } from "../engine.ts";
import { renderComponent, tick } from "../test-support.ts";
import { match, valueOrThrow } from "@tinker/functional";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("template functions in templates", () => {
  test("a template calls an imported template function by name, with arguments", async () => {
    @TemplateFunction("double")
    class Double implements TemplateFunctionContract<[number], number> {
      call(n: number): number {
        return n * 2;
      }
    }
    @Component({ selector: "tk-show", template: "<p>{{ double(value()) }}</p>", imports: [Double] })
    class Show {
      readonly value = signal(4);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Show));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("8");
  });

  test("is created once per component, with inject() and onDestroy() as for any injectable", async () => {
    const log: string[] = [];
    @Injectable()
    class Name {
      readonly value = "Ada";
    }
    @TemplateFunction("label")
    class Label implements TemplateFunctionContract<[], string> {
      private readonly name = inject(Name);

      constructor() {
        log.push("created");
      }

      call(): string {
        return this.name.value;
      }

      onDestroy() {
        log.push("destroyed");
      }
    }
    @Component({ selector: "tk-named", template: "<p>{{ label() }}</p>", imports: [Label] })
    class Named {}
    const view = valueOrThrow(renderComponent(Engine.create({ providers: [Name] }), Named));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("Ada");
    expect(log)
      .toEqual(["created"]);
    view.destroy();
    expect(log)
      .toEqual(["created", "destroyed"]);
  });

  test("a member of the component with the same name is called instead", async () => {
    @TemplateFunction("double")
    class Double implements TemplateFunctionContract<[number], number> {
      call(n: number): number {
        return n * 2;
      }
    }
    @Component({ selector: "tk-shadow", template: "<p>{{ double(2) }}</p>", imports: [Double] })
    class Shadow {
      double(n: number): string {
        return `member ${n}`;
      }
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Shadow));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("member 2");
  });

  test("two imports with the same name are an error", () => {
    @TemplateFunction("same")
    class First implements TemplateFunctionContract<[], number> {
      call(): number {
        return 1;
      }
    }
    @TemplateFunction("same")
    class Second implements TemplateFunctionContract<[], number> {
      call(): number {
        return 2;
      }
    }
    @Component({ selector: "tk-twice", template: "", imports: [First, Second] })
    class Twice {}
    expect(match(renderComponent(Engine.create(), Twice), {
      Left: (error) => error.message,
      Right: () => "rendered",
    }))
      .toContain("imported twice as a template function");
  });
});

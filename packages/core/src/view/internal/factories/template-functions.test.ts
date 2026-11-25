import { afterEach, describe, expect, test, vi } from "vitest";
import { provide } from "../../../di/index.ts";
import { DEV_MODE } from "../tokens.ts";
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

  test("an imported template function can be passed as an argument", async () => {
    @TemplateFunction("isOpen")
    class IsOpen implements TemplateFunctionContract<[{ done: boolean }], boolean> {
      call(todo: { done: boolean }): boolean {
        return !todo.done;
      }
    }
    @Component({
      selector: "tk-open",
      template: "<p>{{ todos().filter(isOpen).length }}</p>",
      imports: [IsOpen],
    })
    class Open {
      readonly todos = signal([{ done: false }, { done: true }, { done: false }]);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Open));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("2");
  });

  test("in development mode, a member that hides an imported template function is warned about", async () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    @TemplateFunction("double")
    class Double implements TemplateFunctionContract<[number], number> {
      call(n: number): number {
        return n * 2;
      }
    }
    @Component({ selector: "tk-hidden", template: "<p>{{ double(2) }}</p>", imports: [Double] })
    class Hidden {
      double(n: number): string {
        return `member ${n}`;
      }
    }
    const engine = Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] });
    const view = valueOrThrow(renderComponent(engine, Hidden));
    await tick();
    expect(warn)
      .toHaveBeenCalledWith("Hidden has a member named \"double\", which hides the template function imported as \"double\"");
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("member 2");
    warn.mockRestore();
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

describe("pipes and flow with template functions", () => {
  test("a pipe passes a value through imported template functions", async () => {
    @TemplateFunction("double")
    class Double implements TemplateFunctionContract<[number], number> {
      call(n: number): number {
        return n * 2;
      }
    }
    @Component({ selector: "tk-piped", template: "<p>{{ value() | double | double }}</p>", imports: [Double] })
    class Piped {
      readonly value = signal(5);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Piped));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("20");
  });

  test("flow of imported template functions is passed to map", async () => {
    @TemplateFunction("double")
    class Double implements TemplateFunctionContract<[number], number> {
      call(n: number): number {
        return n * 2;
      }
    }
    @Component({
      selector: "tk-mapped",
      template: "<p>{{ items().map(flow(double, double)).join(\",\") }}</p>",
      imports: [Double],
    })
    class Mapped {
      readonly items = signal([1, 2]);
    }
    const view = valueOrThrow(renderComponent(Engine.create(), Mapped));
    await tick();
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("4,8");
  });

  test("an import named flow is refused: it is a built-in name", () => {
    @TemplateFunction("flow")
    class Imported implements TemplateFunctionContract<[], number> {
      call(): number {
        return 1;
      }
    }
    @Component({ selector: "tk-flow-import", template: "", imports: [Imported] })
    class Clash {}
    expect(match(renderComponent(Engine.create(), Clash), {
      Left: (error) => error.message,
      Right: () => "rendered",
    }))
      .toContain("is a built-in template function");
  });

  test("in development mode, a member named flow is warned about", async () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => undefined);
    @Component({ selector: "tk-flow-member", template: "<p>{{ flow(1) }}</p>" })
    class Member {
      flow(n: number): string {
        return `member ${n}`;
      }
    }
    const engine = Engine.create({ providers: [provide(DEV_MODE, { useValue: true })] });
    const view = valueOrThrow(renderComponent(engine, Member));
    await tick();
    expect(warn)
      .toHaveBeenCalledWith("Member has a member named \"flow\", which hides the built-in template function flow");
    expect(view.host.nativeElement.querySelector("p")!.textContent)
      .toBe("member 1");
    warn.mockRestore();
  });
});

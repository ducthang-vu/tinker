import { describe, expect, test } from "vitest";
import { match } from "@tinker/functional";
import { Engine } from "../engine.ts";
import {
  isTemplateFunction,
  TemplateFunction,
  type TemplateFunctionContract,
  templateFunctionMemoised,
  templateFunctionName,
} from "./template-function.ts";

@TemplateFunction("format")
class Format implements TemplateFunctionContract<[number], string> {
  call(n: number): string {
    return String(n);
  }
}

describe("@TemplateFunction", () => {
  test("keeps the name the template calls it by, and marks the class", () => {
    expect(match(templateFunctionName(Format), { Some: (name) => name, None: () => "none" }))
      .toBe("format");
    expect(isTemplateFunction(Format))
      .toBe(true);
  });

  test("makes the class injectable: DI creates it", () => {
    const engine = Engine.create({ providers: [Format] });
    expect(engine.get(Format))
      .toBeInstanceOf(Format);
  });

  test("a class without the decorator is not a template function", () => {
    class Plain {}
    expect(isTemplateFunction(Plain))
      .toBe(false);
    expect(match(templateFunctionName(Plain), { Some: () => "some", None: () => "none" }))
      .toBe("none");
  });

  test("throws for a name that is not an identifier", () => {
    expect(() => TemplateFunction("not a name"))
      .toThrow("must be an identifier");
    expect(() => TemplateFunction(""))
      .toThrow("must be an identifier");
  });

  test("throws for a class without a call() method", () => {
    class NoCall {}
    expect(() => TemplateFunction("broken")(NoCall as never, {} as never))
      .toThrow("needs a call() method");
  });
});

describe("@TemplateFunction memoise option", () => {
  test("calls are memoised by default, and memoise: false opts out", () => {
    @TemplateFunction("plain")
    class Plain implements TemplateFunctionContract<[], number> {
      call(): number {
        return 1;
      }
    }
    @TemplateFunction("fresh", { memoise: false })
    class Fresh implements TemplateFunctionContract<[], number> {
      call(): number {
        return 1;
      }
    }
    expect(templateFunctionMemoised(Plain))
      .toBe(true);
    expect(templateFunctionMemoised(Fresh))
      .toBe(false);
  });
});

test("a class that is not a template function is not memoised", () => {
  class Plain {}
  expect(templateFunctionMemoised(Plain))
    .toBe(false);
});

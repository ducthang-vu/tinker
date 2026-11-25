import { describe, expect, test } from "vitest";
import { match } from "@tinker/functional";
import { Engine } from "../engine.ts";
import {
  isTemplateFunction,
  TemplateFunction,
  type TemplateFunctionContract,
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

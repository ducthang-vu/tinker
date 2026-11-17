import { describe, expect, test } from "vitest";
import type { Injector } from "../../../di/index.ts";
import { Scope } from "../template/scope.ts";
import { TemplateRef } from "./template-ref.ts";

describe("TemplateRef", () => {
  test("an instance is rendered with the context's values for the names it declares", () => {
    const seen: Record<string, unknown>[] = [];
    const template = new TemplateRef([], ["item"], new Scope({}), (_body, scope) => {
      seen.push(Object.fromEntries([...scope.lets].map(([name, signal]) => [name, signal()])));
      return {} as never;
    });
    template.instantiate(document.createComment(""), {} as Injector, { item: 7 });
    expect(seen)
      .toEqual([{ item: 7 }]);
  });

  test("a context without a declared name is an error, and nothing is rendered", () => {
    const template = new TemplateRef([], ["item"], new Scope({}), () => {
      throw new Error("not reached");
    });
    expect(() => template.instantiate(document.createComment(""), {} as Injector, {}))
      .toThrow(`The context has no "item", which the template declares with let-item`);
  });
});

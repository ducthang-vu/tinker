import { describe, expect, test } from "vitest";
import type { Injector } from "../../../di/index.ts";
import { Scope } from "../template/scope.ts";
import { TemplateRef } from "./template-ref.ts";

describe("TemplateRef", () => {
  test("an instance sees the context's value for each let- name, and the names around the declaration", () => {
    const seen: Record<string, unknown> = {};
    const declared = new Scope({ title: "around" });
    const template = new TemplateRef([], ["item"], declared, (_body, scope) => {
      for (const [name, signal] of scope.lets) {
        seen[name] = signal();
      }
      return {} as never;
    });
    template.instantiate(document.createComment(""), {} as Injector, { item: 7, extra: 1 });
    expect(seen)
      .toEqual({ item: 7 });
  });

  test("a context without a declared name is an error, and nothing is rendered", () => {
    const template = new TemplateRef([], ["item"], new Scope({}), () => {
      throw new Error("not reached");
    });
    expect(() => template.instantiate(document.createComment(""), {} as Injector, {}))
      .toThrow(`The context has no "item", which the template declares with let-item`);
  });
});

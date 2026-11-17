import { describe, expect, test } from "vitest";
import type { Injector } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { Scope } from "../template/scope.ts";
import { type Context } from "./context.ts";
import { TemplateRef } from "./template-ref.ts";

describe("TemplateRef", () => {
  test("an instance sees the declared names from its context, and the names around the declaration", () => {
    const seen: Record<string, unknown> = {};
    const declared = new Scope({}, new Map([["title", signal("around")]]));
    const template = new TemplateRef([], ["item"], declared, (_body, scope) => {
      for (const [name, entry] of scope.lets) {
        seen[name] = entry();
      }
      return {} as never;
    });
    const context: Context = new Map([["item", signal(7)], ["extra", signal(1)]]);
    template.instantiate(document.createComment(""), {} as Injector, context);
    expect(seen)
      .toEqual({ title: "around", item: 7 });
  });

  test("a context without a declared name is an error, and nothing is rendered", () => {
    const template = new TemplateRef([], ["item"], new Scope({}), () => {
      throw new Error("not reached");
    });
    expect(() => template.instantiate(document.createComment(""), {} as Injector, new Map()))
      .toThrow(`The context has no "item", which the template declares with let-item`);
  });
});

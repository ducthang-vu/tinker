import { describe, expect, test } from "vitest";
import type { Injector } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import { Scope } from "../template/scope.ts";
import { type Context } from "./context.ts";
import { TemplateRef } from "./template-ref.ts";
import { messageOf } from "../test-support.ts";
import { valueOrThrow } from "@tinker/functional/v1";

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
    expect(messageOf(template.instantiate(document.createComment(""), {} as Injector, new Map())))
      .toBe(`The context has no "item", which the template declares with let-item`);
  });

  test("signalsFor holds each declared name's value, and setSignals updates them in place", () => {
    const template = new TemplateRef([], ["item", "other"], new Scope({}), () => {
      throw new Error("not reached");
    });
    const signals = valueOrThrow(template.signalsFor({ item: 1, other: "two" }));
    expect(signals.get("item")!())
      .toBe(1);
    valueOrThrow(template.setSignals(signals, { item: 3, other: "four" }));
    expect(signals.get("other")!())
      .toBe("four");
  });

  test("a value missing for a declared name is an error, when making or setting signals", () => {
    const template = new TemplateRef([], ["item"], new Scope({}), () => {
      throw new Error("not reached");
    });
    expect(messageOf(template.signalsFor({})))
      .toContain(`The context has no "item"`);
    expect(messageOf(template.setSignals(new Map(), {})))
      .toContain(`The context has no "item"`);
  });

  test("letNames lists the names the template declares", () => {
    const template = new TemplateRef([], ["item"], new Scope({}), () => {
      throw new Error("not reached");
    });
    expect(template.letNames)
      .toEqual(["item"]);
  });
});

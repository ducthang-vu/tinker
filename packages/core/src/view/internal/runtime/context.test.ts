import { describe, expect, test } from "vitest";
import { computed, signal } from "../../../signals/index.ts";
import { contextOf, scopeWith } from "./context.ts";

describe("context", () => {
  test("contextOf makes each plain value a signal holding it", () => {
    const context = contextOf({ a: 1, b: "two" });
    expect(context.get("a")!())
      .toBe(1);
    expect(context.get("b")!())
      .toBe("two");
  });

  test("scopeWith puts the context's entries over the names around them", () => {
    const around = new Map([["title", signal("around")], ["item", signal("around item")]]);
    const scope = scopeWith({}, around, new Map([["item", computed(() => "inner")]]));
    expect(scope.lets.get("title")!())
      .toBe("around");
    expect(scope.lets.get("item")!())
      .toBe("inner");
  });
});

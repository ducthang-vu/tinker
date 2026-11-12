import { describe, expect, test } from "vitest";
import { Component, Directive, getComponentMetadata, getDirectiveMetadata } from "./decorators.ts";

describe("@Directive", () => {
  test("records the selector on the class", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}

    expect(getDirectiveMetadata(Highlight)).toEqual({ selector: "[highlight]" });
  });

  test("keeps a copy: changing the options object later has no effect", () => {
    const options = { selector: "[a]" };
    @Directive(options)
    class A {}
    options.selector = "[b]";

    expect(getDirectiveMetadata(A)?.selector).toBe("[a]");
  });

  test("each class has its own metadata", () => {
    @Directive({ selector: "[one]" })
    class One {}
    @Directive({ selector: "[two]" })
    class Two {}

    expect(getDirectiveMetadata(One)?.selector).toBe("[one]");
    expect(getDirectiveMetadata(Two)?.selector).toBe("[two]");
  });

  test("leaves the class itself unchanged", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {
      color = "yellow";
    }

    expect(new Highlight().color).toBe("yellow");
  });

  test("is stored as a hidden, read-only static property of the class", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}

    // (Decorated classes also get the standard `Symbol.metadata`; ours is separate.)
    const key = Object.getOwnPropertySymbols(Highlight).find(
      (symbol) => symbol.description === "directive metadata",
    )!;
    expect(key).toBeDefined();
    expect(Object.keys(Highlight)).toEqual([]);
    expect(() => {
      (Highlight as unknown as Record<symbol, unknown>)[key] = { selector: "[other]" };
    }).toThrow(TypeError);
    expect(Object.isFrozen(getDirectiveMetadata(Highlight))).toBe(true);
  });

  test("a subclass is not a directive unless it is decorated itself", () => {
    @Directive({ selector: "[base]" })
    class Base {}
    class Undecorated extends Base {}
    @Directive({ selector: "[child]" })
    class Child extends Base {}

    expect(getDirectiveMetadata(Undecorated)).toBeUndefined();
    expect(getDirectiveMetadata(Child)?.selector).toBe("[child]");
    expect(getDirectiveMetadata(Base)?.selector).toBe("[base]");
  });

  test("a class without the decorator is not a directive", () => {
    class Plain {}

    expect(getDirectiveMetadata(Plain)).toBeUndefined();
  });
});

describe("@Component", () => {
  test("records the selector and template on the class", () => {
    @Component({ selector: "tk-counter", template: "<p>count</p>" })
    class Counter {}

    expect(getComponentMetadata(Counter)).toEqual({
      selector: "tk-counter",
      template: "<p>count</p>",
    });
  });

  test("a component is also a directive with the same selector", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {}

    expect(getDirectiveMetadata(Counter)).toEqual({ selector: "tk-counter" });
  });

  test("keeps a frozen copy, stored as a read-only static property", () => {
    const options = { selector: "tk-a", template: "a" };
    @Component(options)
    class A {}
    options.template = "changed";

    const metadata = getComponentMetadata(A)!;
    expect(metadata.template).toBe("a");
    expect(Object.isFrozen(metadata)).toBe(true);
    const key = Object.getOwnPropertySymbols(A).find(
      (symbol) => symbol.description === "component metadata",
    )!;
    expect(() => {
      (A as unknown as Record<symbol, unknown>)[key] = {};
    }).toThrow(TypeError);
  });

  test("a subclass is not a component unless it is decorated itself", () => {
    @Component({ selector: "tk-base", template: "base" })
    class Base {}
    class Undecorated extends Base {}

    expect(getComponentMetadata(Undecorated)).toBeUndefined();
    expect(getDirectiveMetadata(Undecorated)).toBeUndefined();
  });

  test("a plain directive is not a component", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}
    class Plain {}

    expect(getComponentMetadata(Highlight)).toBeUndefined();
    expect(getComponentMetadata(Plain)).toBeUndefined();
  });

  test("leaves the class itself unchanged", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {
      count = 1;
    }

    expect(new Counter().count).toBe(1);
  });
});

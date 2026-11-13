import { describe, expect, test } from "vitest";
import { Component, Directive, getComponentMetadata, getDirectiveMetadata } from "./decorators.ts";

describe("@Directive", () => {
  test("records the selector on the class", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}

    expect(getDirectiveMetadata(Highlight).getOrElse(undefined)).toEqual({ selector: "[highlight]" });
  });

  test("keeps a copy: changing the options object later has no effect", () => {
    const options = { selector: "[a]" };
    @Directive(options)
    class A {}
    options.selector = "[b]";

    expect(getDirectiveMetadata(A).map((metadata) => metadata.selector).getOrElse(undefined)).toBe("[a]");
  });

  test("each class has its own metadata", () => {
    @Directive({ selector: "[one]" })
    class One {}
    @Directive({ selector: "[two]" })
    class Two {}

    expect(getDirectiveMetadata(One).map((metadata) => metadata.selector).getOrElse(undefined)).toBe("[one]");
    expect(getDirectiveMetadata(Two).map((metadata) => metadata.selector).getOrElse(undefined)).toBe("[two]");
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
    expect(Object.isFrozen(getDirectiveMetadata(Highlight).getOrElse(undefined))).toBe(true);
  });

  test("a subclass is not a directive unless it is decorated itself", () => {
    @Directive({ selector: "[base]" })
    class Base {}
    class Undecorated extends Base {}
    @Directive({ selector: "[child]" })
    class Child extends Base {}

    expect(getDirectiveMetadata(Undecorated).isNone()).toBe(true);
    expect(getDirectiveMetadata(Child).map((metadata) => metadata.selector).getOrElse(undefined)).toBe("[child]");
    expect(getDirectiveMetadata(Base).map((metadata) => metadata.selector).getOrElse(undefined)).toBe("[base]");
  });

  test("a class without the decorator is not a directive", () => {
    class Plain {}

    expect(getDirectiveMetadata(Plain).isNone()).toBe(true);
  });
});

describe("@Component", () => {
  test("records the selector and template on the class", () => {
    @Component({ selector: "tk-counter", template: "<p>count</p>" })
    class Counter {}

    expect(getComponentMetadata(Counter).getOrElse(undefined)).toEqual({
      selector: "tk-counter",
      template: "<p>count</p>",
    });
  });

  test("a component is also a directive with the same selector", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {}

    expect(getDirectiveMetadata(Counter).getOrElse(undefined)).toEqual({ selector: "tk-counter" });
  });

  test("keeps a frozen copy, stored as a read-only static property", () => {
    const options = { selector: "tk-a", template: "a" };
    @Component(options)
    class A {}
    options.template = "changed";

    const metadata = getComponentMetadata(A).getOrElse(undefined)!;
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

    expect(getComponentMetadata(Undecorated).isNone()).toBe(true);
    expect(getDirectiveMetadata(Undecorated).isNone()).toBe(true);
  });

  test("a plain directive is not a component", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}
    class Plain {}

    expect(getComponentMetadata(Highlight).isNone()).toBe(true);
    expect(getComponentMetadata(Plain).isNone()).toBe(true);
  });

  test("leaves the class itself unchanged", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {
      count = 1;
    }

    expect(new Counter().count).toBe(1);
  });
});

describe("host option", () => {
  test("@Directive and @Component record a frozen copy of host", () => {
    const host = { "(click)": "go()" };
    @Directive({ selector: "[d]", host })
    class D {}
    @Component({ selector: "tk-c", template: "", host })
    class C {}
    host["(click)"] = "changed()";

    expect(getDirectiveMetadata(D).map((metadata) => metadata.host).getOrElse(undefined)).toEqual({ "(click)": "go()" });
    expect(Object.isFrozen(getDirectiveMetadata(D).map((metadata) => metadata.host).getOrElse(undefined))).toBe(true);
    expect(getComponentMetadata(C).map((metadata) => metadata.host).getOrElse(undefined)).toEqual({ "(click)": "go()" });
    expect(getDirectiveMetadata(C).map((metadata) => metadata.host).getOrElse(undefined)).toEqual({ "(click)": "go()" });
  });

  test("without host, the metadata has no host entry", () => {
    @Directive({ selector: "[d]" })
    class D {}
    expect(getDirectiveMetadata(D).getOrElse(undefined)).toEqual({ selector: "[d]" });
  });
});

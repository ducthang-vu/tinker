import { describe, expect, test } from "vitest";
import { Component, Directive, getComponentMetadata, getDirectiveMetadata } from "./decorators.ts";
import { isNone, getOrElse, map } from "@tinker/functional/v1";

describe("@Directive", () => {
  test("records the selector on the class", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}

    expect(getOrElse(getDirectiveMetadata(Highlight), undefined))
      .toEqual({ selector: "[highlight]" });
  });

  test("keeps a copy: changing the options object later has no effect", () => {
    const options = { selector: "[a]" };
    @Directive(options)
    class A {}
    options.selector = "[b]";

    expect(getOrElse(map(getDirectiveMetadata(A), (metadata) => metadata.selector), undefined))
      .toBe("[a]");
  });

  test("each class has its own metadata", () => {
    @Directive({ selector: "[one]" })
    class One {}
    @Directive({ selector: "[two]" })
    class Two {}

    expect(getOrElse(map(getDirectiveMetadata(One), (metadata) => metadata.selector), undefined))
      .toBe("[one]");
    expect(getOrElse(map(getDirectiveMetadata(Two), (metadata) => metadata.selector), undefined))
      .toBe("[two]");
  });

  test("leaves the class itself unchanged", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {
      color = "yellow";
    }

    expect(new Highlight().color)
      .toBe("yellow");
  });

  test("is stored as a hidden, read-only static property of the class", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}

    // (Decorated classes also get the standard `Symbol.metadata`; ours is separate.)
    const key = Object.getOwnPropertySymbols(Highlight)
      .find(
        (symbol) => symbol.description === "directive metadata",
      )!;
    expect(key)
      .toBeDefined();
    expect(Object.keys(Highlight))
      .toEqual([]);
    expect(() => {
      (Highlight as unknown as Record<symbol, unknown>)[key] = { selector: "[other]" };
    })
      .toThrow(TypeError);
    expect(Object.isFrozen(getOrElse(getDirectiveMetadata(Highlight), undefined)))
      .toBe(true);
  });

  test("a subclass is not a directive unless it is decorated itself", () => {
    @Directive({ selector: "[base]" })
    class Base {}
    class Undecorated extends Base {}
    @Directive({ selector: "[child]" })
    class Child extends Base {}

    expect(isNone(getDirectiveMetadata(Undecorated)))
      .toBe(true);
    expect(getOrElse(map(getDirectiveMetadata(Child), (metadata) => metadata.selector), undefined))
      .toBe("[child]");
    expect(getOrElse(map(getDirectiveMetadata(Base), (metadata) => metadata.selector), undefined))
      .toBe("[base]");
  });

  test("a class without the decorator is not a directive", () => {
    class Plain {}

    expect(isNone(getDirectiveMetadata(Plain)))
      .toBe(true);
  });
});

describe("@Component", () => {
  test("records the selector and template on the class", () => {
    @Component({ selector: "tk-counter", template: "<p>count</p>" })
    class Counter {}

    expect(getOrElse(getComponentMetadata(Counter), undefined))
      .toEqual({
        selector: "tk-counter",
        template: "<p>count</p>",
      });
  });

  test("a component is also a directive with the same selector", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {}

    expect(getOrElse(getDirectiveMetadata(Counter), undefined))
      .toEqual({ selector: "tk-counter" });
  });

  test("keeps a frozen copy, stored as a read-only static property", () => {
    const options = { selector: "tk-a", template: "a" };
    @Component(options)
    class A {}
    options.template = "changed";

    const metadata = getOrElse(getComponentMetadata(A), undefined)!;
    expect(metadata.template)
      .toBe("a");
    expect(Object.isFrozen(metadata))
      .toBe(true);
    const key = Object.getOwnPropertySymbols(A)
      .find(
        (symbol) => symbol.description === "component metadata",
      )!;
    expect(() => {
      (A as unknown as Record<symbol, unknown>)[key] = {};
    })
      .toThrow(TypeError);
  });

  test("a subclass is not a component unless it is decorated itself", () => {
    @Component({ selector: "tk-base", template: "base" })
    class Base {}
    class Undecorated extends Base {}

    expect(isNone(getComponentMetadata(Undecorated)))
      .toBe(true);
    expect(isNone(getDirectiveMetadata(Undecorated)))
      .toBe(true);
  });

  test("a plain directive is not a component", () => {
    @Directive({ selector: "[highlight]" })
    class Highlight {}
    class Plain {}

    expect(isNone(getComponentMetadata(Highlight)))
      .toBe(true);
    expect(isNone(getComponentMetadata(Plain)))
      .toBe(true);
  });

  test("leaves the class itself unchanged", () => {
    @Component({ selector: "tk-counter", template: "" })
    class Counter {
      count = 1;
    }

    expect(new Counter().count)
      .toBe(1);
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

    expect(getOrElse(map(getDirectiveMetadata(D), (metadata) => metadata.host), undefined))
      .toEqual({ "(click)": "go()" });
    expect(
      Object.isFrozen(
        getOrElse(map(getDirectiveMetadata(D), (metadata) => metadata.host), undefined),
      ),
    )
      .toBe(true);
    expect(getOrElse(map(getComponentMetadata(C), (metadata) => metadata.host), undefined))
      .toEqual({ "(click)": "go()" });
    expect(getOrElse(map(getDirectiveMetadata(C), (metadata) => metadata.host), undefined))
      .toEqual({ "(click)": "go()" });
  });

  test("without host, the metadata has no host entry", () => {
    @Directive({ selector: "[d]" })
    class D {}
    expect(getOrElse(getDirectiveMetadata(D), undefined))
      .toEqual({ selector: "[d]" });
  });
});

test("@Component records its providers, frozen", () => {
  class Service {}
  @Component({ selector: "tk-p", template: "", providers: [Service] })
  class WithProviders {}
  @Component({ selector: "tk-q", template: "" })
  class WithoutProviders {}
  const metadata = getOrElse(getComponentMetadata(WithProviders), undefined)!;
  expect(metadata.providers)
    .toEqual([Service]);
  expect(Object.isFrozen(metadata.providers))
    .toBe(true);
  expect(getOrElse(map(getComponentMetadata(WithoutProviders), (m) => m.providers), undefined))
    .toBeUndefined();
});

test("@Directive records its providers, frozen; a component's providers stay off its directive metadata", () => {
  class Service {}
  @Directive({ selector: "[d]", providers: [Service] })
  class WithProviders {}
  @Component({ selector: "tk-c", template: "", providers: [Service] })
  class AComponent {}
  const metadata = getOrElse(getDirectiveMetadata(WithProviders), undefined)!;
  expect(metadata.providers)
    .toEqual([Service]);
  expect(Object.isFrozen(metadata.providers))
    .toBe(true);
  expect(getOrElse(map(getDirectiveMetadata(AComponent), (m) => m.providers), undefined))
    .toBeUndefined();
});

test("@Component records its imports and host directives, frozen", () => {
  @Directive({ selector: "[d]" })
  class D {}
  @Component({ selector: "tk-i", template: "", imports: [D], hostDirectives: [D] })
  class WithBoth {}
  const metadata = getOrElse(getComponentMetadata(WithBoth), undefined)!;
  expect([metadata.imports, metadata.hostDirectives])
    .toEqual([[D], [D]]);
  expect(Object.isFrozen(metadata.imports) && Object.isFrozen(metadata.hostDirectives))
    .toBe(true);
});

describe("templateUrl and styleUrls without the compiler", () => {
  test("@Component throws: the files are read at build time, so the build must run the compiler", () => {
    expect(() => Component({ selector: "tk-x", template: "", styleUrls: ["./x.css"] }))
      .toThrow(/need the Tinker compiler/);
    expect(() => Component({ selector: "tk-x", templateUrl: "./x.html" }))
      .toThrow(/need the Tinker compiler/);
  });
});

import { describe, expect, expectTypeOf, test } from "vitest";
import { currentInjector, runInInjectionContext } from "./context/current-injector.ts";
import { inject, InjectionToken, type Token } from "./inject.ts";
import { INJECTOR, Injector } from "./injector.ts";
import { CircularDependencyError } from "./provider-records.ts";

const API_URL = new InjectionToken<string>("API_URL");

describe("inject", () => {
  test("throws outside an injection context", () => {
    expect(() => inject(API_URL))
      .toThrow("inject() must be called in an injection context");
  });

  test("gives the value of a token from the current injector, typed by the token", () => {
    const injector = new Injector([{ token: API_URL, factory: () => "here" }]);
    const url = runInInjectionContext(injector, () => inject(API_URL));
    expectTypeOf(url)
      .toEqualTypeOf<string>();
    expect(url)
      .toBe("here");
  });

  test("walks up to the parents", () => {
    const root = new Injector([{ token: API_URL, factory: () => "from root" }]);
    const child = new Injector([], root);
    const grandchild = new Injector([], child);
    expect(runInInjectionContext(grandchild, () => inject(API_URL)))
      .toBe("from root");
  });

  test("the nearest provider wins", () => {
    const root = new Injector([{ token: API_URL, factory: () => "root" }]);
    const child = new Injector([{ token: API_URL, factory: () => "child" }], root);
    expect(runInInjectionContext(child, () => inject(API_URL)))
      .toBe("child");
  });

  test("throws when nothing in the chain provides the token", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(() => runInInjectionContext(child, () => inject(API_URL)))
      .toThrow("No provider for API_URL");
  });

  test("children share the instance created by the injector that provides it", () => {
    const STORE = new InjectionToken<Store>("Store");
    class Store {}
    const root = new Injector([{ token: STORE, factory: () => new Store() }]);
    const a = new Injector([], root);
    const b = new Injector([], root);
    const fromA = runInInjectionContext(a, () => inject(STORE));
    const fromB = runInInjectionContext(b, () => inject(STORE));
    expect(fromA)
      .toBe(fromB);
    expect(fromA)
      .toBe(root.get(STORE));
  });

  test("dependencies resolve from the injector that owns the value", () => {
    const API = new InjectionToken<Api>("Api");
    class Api {
      readonly url = inject(API_URL);
    }
    const root = new Injector([
      { token: API_URL, factory: () => "root url" },
      { token: API, factory: () => new Api() },
    ]);
    const child = new Injector([{ token: API_URL, factory: () => "child url" }], root);

    const api = runInInjectionContext(child, () => inject(API));

    // Api is provided by the root, so its own inject() calls see the root, not the child.
    expect(api.url)
      .toBe("root url");
  });

  test("works in field initializers of nested creations, and restores the context", () => {
    const INNER = new InjectionToken<Inner>("Inner");
    class Inner {
      readonly url = inject(API_URL);
    }
    const OUTER = new InjectionToken<Outer>("Outer");
    class Outer {
      readonly inner = inject(INNER);
      readonly contextAfterInner = currentInjector.get();
    }
    const injector = new Injector([
      { token: API_URL, factory: () => "url" },
      { token: INNER, factory: () => new Inner() },
      { token: OUTER, factory: () => new Outer() },
    ]);

    const outer = runInInjectionContext(injector, () => inject(OUTER));

    expect(outer.inner.url)
      .toBe("url");
    expect(outer.contextAfterInner)
      .toBe(injector);
  });

  test("cannot be used later, outside the context (no service locator)", () => {
    const LAZY = new InjectionToken<Lazy>("Lazy");
    class Lazy {
      later = () => inject(API_URL);
    }
    const injector = new Injector([
      { token: API_URL, factory: () => "x" },
      { token: LAZY, factory: () => new Lazy() },
    ]);
    const lazy = injector.get(LAZY);
    expect(() => lazy.later())
      .toThrow("inject() must be called in an injection context");
  });
});

describe("inject options", () => {
  const provide = (value: string) => [{ token: API_URL, factory: () => value }];
  const run = <R>(injector: Injector, fn: () => R) => runInInjectionContext(injector, fn);

  test("hostBoundary is off by default and can be set by the framework", () => {
    expect(new Injector([]).hostBoundary)
      .toBe(false);
    expect(new Injector([], undefined, { hostBoundary: true }).hostBoundary)
      .toBe(true);
  });

  test("self: only the current injector", () => {
    const root = new Injector(provide("root"));
    const child = new Injector([], root);
    const own = new Injector(provide("own"), root);
    expect(() => run(child, () => inject(API_URL, { self: true })))
      .toThrow("No provider for API_URL");
    expect(run(own, () => inject(API_URL, { self: true })))
      .toBe("own");
  });

  test("skipSelf: starts at the parent", () => {
    const root = new Injector(provide("root"));
    const child = new Injector(provide("child"), root);
    expect(run(child, () => inject(API_URL, { skipSelf: true })))
      .toBe("root");
    expect(() => run(root, () => inject(API_URL, { skipSelf: true })))
      .toThrow("No provider for API_URL");
  });

  test("host: stops after the first host boundary (included)", () => {
    const root = new Injector(provide("root"));
    const component = new Injector([], root, { hostBoundary: true });
    const directive = new Injector([], component);
    expect(() => run(directive, () => inject(API_URL, { host: true })))
      .toThrow("No provider for API_URL");
    expect(run(directive, () => inject(API_URL)))
      .toBe("root"); // without host, it walks on

    const providingComponent = new Injector(provide("component"), root, { hostBoundary: true });
    expect(run(new Injector([], providingComponent), () => inject(API_URL, { host: true })))
      .toBe("component");
  });

  test("host without any boundary walks to the root", () => {
    const root = new Injector(provide("root"));
    expect(run(new Injector([], root), () => inject(API_URL, { host: true })))
      .toBe("root");
  });

  test("optional: null instead of throwing, typed as T | null", () => {
    const injector = new Injector([]);
    const result = run(injector, () => inject(API_URL, { optional: true }));
    expectTypeOf(result)
      .toEqualTypeOf<string | null>();
    expect(result)
      .toBeNull();
  });

  test("optional still returns the value when it is found", () => {
    expect(run(new Injector(provide("x")), () => inject(API_URL, { optional: true })))
      .toBe("x");
  });

  test("the return type is T unless optional may be true", () => {
    const injector = new Injector(provide("x"));
    expectTypeOf(run(injector, () => inject(API_URL)))
      .toEqualTypeOf<string>();
    expectTypeOf(run(injector, () => inject(API_URL, { self: true })))
      .toEqualTypeOf<string>();
    expectTypeOf(run(injector, () => inject(API_URL, { optional: false })))
      .toEqualTypeOf<string>();
    const maybe: boolean = Math.random() > 2;
    expectTypeOf(run(injector, () => inject(API_URL, { optional: maybe })))
      .toEqualTypeOf<string | null>();
  });

  test("options combine", () => {
    const root = new Injector(provide("root"));
    const child = new Injector([], root);
    expect(run(child, () => inject(API_URL, { self: true, optional: true })))
      .toBeNull();
    expect(run(child, () => inject(API_URL, { skipSelf: true, optional: true })))
      .toBe("root");
    const boundary = new Injector([], root, { hostBoundary: true });
    expect(run(new Injector([], boundary), () => inject(API_URL, { host: true, optional: true })))
      .toBeNull();
  });

  test("self and skipSelf together are rejected", () => {
    expect(() => run(new Injector(provide("x")), () => inject(API_URL, { self: true, skipSelf: true })))
      .toThrow(
        "inject(): `self` and `skipSelf` cannot be used together",
      );
  });

  test("still requires an injection context, even when optional", () => {
    expect(() => inject(API_URL, { optional: true }))
      .toThrow("inject() must be called in an injection context");
  });
});

describe("circular dependencies", () => {
  const CART = new InjectionToken<Cart>("Cart");
  class Cart {
    readonly payment = inject(PAYMENT);
  }
  const PAYMENT = new InjectionToken<Payment>("Payment");
  class Payment {
    readonly cart = inject(CART);
  }

  test("a cycle between classes throws a clear error instead of overflowing the stack", () => {
    const injector = new Injector([
      { token: CART, factory: () => new Cart() },
      { token: PAYMENT, factory: () => new Payment() },
    ]);
    expect(() => runInInjectionContext(injector, () => inject(CART)))
      .toThrow(
        "Circular dependency: Cart → Payment → Cart",
      );
  });

  test("a cycle is found when the request comes through a child injector", () => {
    const root = new Injector([{ token: PAYMENT, factory: () => new Payment() }]);
    const child = new Injector([{ token: CART, factory: () => new Cart() }], root);
    // Payment is created by the root, so it looks for Cart from the root: not found there.
    expect(() => runInInjectionContext(child, () => inject(CART)))
      .toThrow("No provider for Cart");

    const both = new Injector([
      { token: CART, factory: () => new Cart() },
      { token: PAYMENT, factory: () => new Payment() },
    ]);
    const leaf = new Injector([], both);
    expect(() => runInInjectionContext(leaf, () => inject(CART)))
      .toThrow(CircularDependencyError);
  });

  test("optional does not hide a cycle", () => {
    const injector = new Injector([
      { token: CART, factory: () => new Cart() },
      { token: PAYMENT, factory: () => new Payment() },
    ]);
    expect(() => runInInjectionContext(injector, () => inject(CART, { optional: true })))
      .toThrow(
        CircularDependencyError,
      );
  });

  test("a child overriding a token with a wrapper of the parent's is not a cycle", () => {
    const LOGGER = new InjectionToken<string>("LOGGER");
    const root = new Injector([{ token: LOGGER, factory: () => "root logger" }]);
    const child = new Injector(
      [{ token: LOGGER, factory: () => `prefixed ${inject(LOGGER, { skipSelf: true })}` }],
      root,
    );
    expect(runInInjectionContext(child, () => inject(LOGGER)))
      .toBe("prefixed root logger");
  });

  test("the injector keeps working after a cycle error", () => {
    const injector = new Injector([
      { token: CART, factory: () => new Cart() },
      { token: PAYMENT, factory: () => new Payment() },
      { token: API_URL, factory: () => "still fine" },
    ]);
    expect(() => injector.get(CART))
      .toThrow(CircularDependencyError);
    expect(() => injector.get(CART))
      .toThrow(CircularDependencyError); // not a stale marker: a real cycle again
    expect(injector.get(API_URL))
      .toBe("still fine");
  });
});

describe("inject(INJECTOR)", () => {
  test("gives the injector of the current injection context", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(runInInjectionContext(child, () => inject(INJECTOR)))
      .toBe(child);
  });

  test("inside a factory, gives the injector that owns the value being created", () => {
    const NEEDS_INJECTOR = new InjectionToken<NeedsInjector>("NeedsInjector");
    class NeedsInjector {
      readonly injector = inject(INJECTOR);
    }
    const root = new Injector([{ token: NEEDS_INJECTOR, factory: () => new NeedsInjector() }]);
    const child = new Injector([], root);
    const value = runInInjectionContext(child, () => inject(NEEDS_INJECTOR));
    expect(value.injector)
      .toBe(root);
  });

  test("with skipSelf, gives the parent", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(runInInjectionContext(child, () => inject(INJECTOR, { skipSelf: true })))
      .toBe(root);
  });
});

describe("InjectionToken", () => {
  test("is a Token typed by its value, named for messages", () => {
    const token = new InjectionToken<string>("API_URL");
    expectTypeOf(token)
      .toExtend<Token<string>>();
    expectTypeOf(token).not.toExtend<Token<number>>();
    expect(token.name)
      .toBe("API_URL");
  });

  test("tokens with the same name are still different tokens", () => {
    expect(new InjectionToken<string>("X")).not.toBe(new InjectionToken<string>("X"));
  });

  test("has no marker property at runtime", () => {
    const token = new InjectionToken<string>("API_URL");
    expect(Object.getOwnPropertySymbols(token))
      .toEqual([]);
    expect(Object.keys(token))
      .toEqual(["name", "multi"]); // real properties only: the type markers never exist
  });

  test("a plain { name } object or a class cannot pass for a token", () => {
    class SomeClass {}
    expectTypeOf({ name: "API_URL" }).not.toExtend<Token<string>>();
    expectTypeOf(SomeClass).not.toExtend<Token<string>>();
    expectTypeOf(SomeClass).not.toExtend<Token<SomeClass>>();
  });
});

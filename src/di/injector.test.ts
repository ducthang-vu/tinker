import { describe, expect, expectTypeOf, test } from "vitest";
import { inject } from "./inject.ts";
import { Injector, runInInjectionContext } from "./injector.ts";
import { InjectionToken } from "./internal/inject.ts";

const API_URL = new InjectionToken<string>("API_URL");

class Clock {
  now = 42;
}

describe("Injector.create", () => {
  test("creates an injector from public providers", () => {
    const injector = Injector.create({ providers: [Clock, { provide: API_URL, useValue: "https://api" }] }).injector;
    expect(runInInjectionContext(injector, () => inject(Clock))).toBeInstanceOf(Clock);
    expect(runInInjectionContext(injector, () => inject(API_URL))).toBe("https://api");
  });

  test("without options, it provides nothing (except itself)", () => {
    const injector = Injector.create().injector;
    expect(() => runInInjectionContext(injector, () => inject(Clock))).toThrow("No provider for Clock");
    expect(runInInjectionContext(injector, () => inject(Injector))).toBe(injector);
  });

  test("with a parent, looks up there what it does not provide", () => {
    const root = Injector.create({ providers: [{ provide: API_URL, useValue: "root" }] }).injector;
    const child = Injector.create({ providers: [Clock], parent: root }).injector;
    expect(runInInjectionContext(child, () => inject(API_URL))).toBe("root");
    expect(() => runInInjectionContext(root, () => inject(Clock))).toThrow("No provider for Clock");
  });

  test("values are created once per injector", () => {
    const injector = Injector.create({ providers: [Clock] }).injector;
    const [a, b] = runInInjectionContext(injector, () => [inject(Clock), inject(Clock)]);
    expect(a).toBe(b);
  });
});

describe("public Injector", () => {
  test("inject(Injector) gives the current injector, typed as Injector", () => {
    const injector = Injector.create().injector;
    const handle = runInInjectionContext(injector, () => inject(Injector));
    expectTypeOf(handle).toEqualTypeOf<Injector>();
    expect(handle).toBe(injector);
  });

  test("inside a value being created, gives the injector that owns it", () => {
    class NeedsInjector {
      readonly injector = inject(Injector);
    }
    const root = Injector.create({ providers: [NeedsInjector] }).injector;
    const child = Injector.create({ parent: root }).injector;
    const value = runInInjectionContext(child, () => inject(NeedsInjector));
    expect(value.injector).toBe(root);
  });

  test("it is opaque: no methods, so no service locator", () => {
    expectTypeOf<Injector>().not.toHaveProperty("get");
    expectTypeOf<Injector>().not.toHaveProperty("has");
    expectTypeOf<Injector>().not.toHaveProperty("parent");
    expectTypeOf<Injector>().not.toHaveProperty("destroy");
  });

  test("a plain object cannot pass for an Injector, and it cannot be instantiated", () => {
    expectTypeOf({}).not.toExtend<Injector>();
    // @ts-expect-error abstract: cannot be instantiated
    const direct = () => new Injector();
    void direct;
  });
});

describe("public runInInjectionContext", () => {
  test("a stored injector lets code run later in the same injection context", () => {
    class Report {
      private readonly injector = inject(Injector);
      urlLater(): string {
        return runInInjectionContext(this.injector, () => inject(API_URL));
      }
    }
    const injector = Injector.create({ providers: [{ provide: API_URL, useValue: "https://api" }, Report] }).injector;
    const report = runInInjectionContext(injector, () => inject(Report));

    // Later, outside any injection context:
    expect(() => inject(API_URL)).toThrow("inject() must be called in an injection context");
    expect(report.urlLater()).toBe("https://api");
  });

  test("returns the result, and restores the previous context even on throw", () => {
    const injector = Injector.create({ providers: [{ provide: API_URL, useValue: "x" }] }).injector;
    expect(runInInjectionContext(injector, () => inject(API_URL))).toBe("x");
    expect(() =>
      runInInjectionContext(injector, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(() => inject(API_URL)).toThrow("inject() must be called in an injection context");
  });
});

describe("InjectorRef", () => {
  class Connection {
    closed = 0;
    onDestroy() {
      this.closed++;
    }
  }

  test("holds the created injector", () => {
    const ref = Injector.create();
    expectTypeOf(ref.injector).toEqualTypeOf<Injector>();
    expect(runInInjectionContext(ref.injector, () => inject(Injector))).toBe(ref.injector);
  });

  test("destroy() lets the created values clean up, once", () => {
    const ref = Injector.create({ providers: [Connection] });
    const connection = runInInjectionContext(ref.injector, () => inject(Connection));
    ref.destroy();
    ref.destroy();
    expect(connection.closed).toBe(1);
  });

  test("destroy() destroys the children too", () => {
    const root = Injector.create();
    const child = Injector.create({ providers: [Connection], parent: root.injector });
    const connection = runInInjectionContext(child.injector, () => inject(Connection));
    root.destroy();
    expect(connection.closed).toBe(1);
  });

  test("a destroyed injector refuses to work", () => {
    const ref = Injector.create({ providers: [Clock] });
    ref.destroy();
    expect(() => runInInjectionContext(ref.injector, () => inject(Clock))).toThrow(
      "Injector has already been destroyed",
    );
  });

  test("only the ref can destroy: the injector itself has no destroy()", () => {
    expectTypeOf<Injector>().not.toHaveProperty("destroy");
    expectTypeOf<ReturnType<typeof Injector.create>>().toHaveProperty("destroy");
  });
});

// Integration: dependency injection with real injectors, providers and lookups, and
// no test doubles. Each test builds the injector tree it describes, and resolves
// tokens through the public API only.

import { describe, expect, test } from "vitest";
import { inject, Injectable, InjectionToken, Injector, provide, runInInjectionContext } from "./index.ts";

const CONFIG = new InjectionToken<{ apiUrl: string }>("CONFIG");
const API = new InjectionToken<{ url: string }>("API");
const CONNECTION = new InjectionToken<Connection>("CONNECTION");

/** A service with cleanup: `onDestroy` runs when its injector is destroyed. */
class Connection {
  constructor(readonly events: string[], readonly name: string) {}
  onDestroy(): void {
    this.events.push(`${this.name} closed`);
  }
}

/** Resolve `token` as seen from `injector`. */
function resolve<T>(injector: Injector, token: InjectionToken<T>): T {
  return runInInjectionContext(injector, () => inject(token));
}

describe("services that depend on services", () => {
  test("a factory injects the token it depends on, through the whole chain", () => {
    const { injector } = Injector.create({
      providers: [
        provide(CONFIG, { useValue: { apiUrl: "https://example.test" } }),
        provide(API, {
          useFactory: () => ({ url: `${inject(CONFIG).apiUrl}/v1` }),
        }),
      ],
    });
    expect(resolve(injector, API).url)
      .toBe("https://example.test/v1");
  });

  test("a child injector resolves a token its parent provides", () => {
    const parent = Injector.create({
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://a.test" } })],
    }).injector;
    const child = Injector.create({
      parent,
      providers: [provide(API, { useFactory: () => ({ url: inject(CONFIG).apiUrl }) })],
    }).injector;
    expect(resolve(child, API).url)
      .toBe("https://a.test");
  });
});

describe("shadowing and lookup options", () => {
  test("a child's provider shadows its parent's, and the parent is unchanged", () => {
    const parent = Injector.create({
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://parent.test" } })],
    }).injector;
    const child = Injector.create({
      parent,
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://child.test" } })],
    }).injector;
    expect(resolve(child, CONFIG).apiUrl)
      .toBe("https://child.test");
    expect(resolve(parent, CONFIG).apiUrl)
      .toBe("https://parent.test");
  });

  test("skipSelf reaches the parent's value even when the child shadows it", () => {
    const parent = Injector.create({
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://parent.test" } })],
    }).injector;
    const child = Injector.create({
      parent,
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://child.test" } })],
    }).injector;
    const fromParent = runInInjectionContext(child, () => inject(CONFIG, { skipSelf: true }));
    expect(fromParent.apiUrl)
      .toBe("https://parent.test");
  });

  test("self does not look at the parent, and optional returns null instead of throwing", () => {
    const parent = Injector.create({
      providers: [provide(CONFIG, { useValue: { apiUrl: "https://parent.test" } })],
    }).injector;
    const child = Injector.create({ parent }).injector;
    expect(() => runInInjectionContext(child, () => inject(CONFIG, { self: true })))
      .toThrow();
    expect(runInInjectionContext(child, () => inject(CONFIG, { optional: true })))
      .toEqual({ apiUrl: "https://parent.test" });
    expect(runInInjectionContext(child, () => inject(API, { optional: true })))
      .toBeNull();
  });

  test("a token nothing provides throws when it is required", () => {
    const { injector } = Injector.create();
    expect(() => resolve(injector, API))
      .toThrow();
  });
});

describe("instances and cleanup", () => {
  test("each injector creates its own instance once, and reuses it", () => {
    const parent = Injector.create({
      providers: [provide(CONNECTION, { useFactory: () => new Connection([], "parent") })],
    }).injector;
    const child = Injector.create({ parent }).injector;
    const fromParent = resolve(parent, CONNECTION);
    expect(resolve(parent, CONNECTION))
      .toBe(fromParent);
    expect(resolve(child, CONNECTION))
      .toBe(fromParent);
  });

  test("destroying a parent cleans up its values and its child, in reverse order of creation", () => {
    const events: string[] = [];
    const CHILD = new InjectionToken<Connection>("CHILD");
    const parent = Injector.create({
      providers: [provide(CONNECTION, { useFactory: () => new Connection(events, "parent") })],
    });
    resolve(parent.injector, CONNECTION);
    const child = Injector.create({
      parent: parent.injector,
      providers: [provide(CHILD, { useFactory: () => new Connection(events, "child") })],
    });
    resolve(child.injector, CHILD);
    expect(events)
      .toEqual([]);
    parent.destroy();
    expect(events)
      .toEqual(["child closed", "parent closed"]);
    child.destroy();
    expect(events)
      .toEqual(["child closed", "parent closed"]);
  });
});

describe("a class service, injected by its own injector", () => {
  @Injectable()
  class Clock {
    readonly now = 42;
  }

  test("a service class resolves its dependencies by inject() in its constructor", () => {
    @Injectable()
    class Greeter {
      readonly clock = inject(Clock);
      greet(): string {
        return `at ${this.clock.now}`;
      }
    }
    const { injector } = Injector.create({
      providers: [Clock, Greeter],
    });
    expect(runInInjectionContext(injector, () => inject(Greeter))
      .greet())
      .toBe("at 42");
  });
});

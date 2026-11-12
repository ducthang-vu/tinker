import { describe, expect, expectTypeOf, test } from "vitest";
import { inject } from "./inject.ts";
import { adaptProvider } from "./adapter.ts";
import { runInInjectionContext } from "./internal/context/current-injector.ts";
import { InjectionToken } from "./internal/inject.ts";
import { Injector } from "./internal/injector.ts";
import type { Provider } from "./providers.ts";

abstract class Logger {
  abstract log(message: string): string;
}
class ConsoleLogger extends Logger {
  log(message: string): string {
    return `console: ${message}`;
  }
}
class Clock {
  now = 42;
}
const API_URL = new InjectionToken<string>("API_URL");

/** Run `fn` in an injector built from public providers. */
const withProviders = <R>(providers: Provider[], fn: () => R, parent?: Injector): R =>
  runInInjectionContext(new Injector(providers.map(adaptProvider), parent), fn);

describe("public inject", () => {
  test("a class, typed by its instances", () => {
    const clock = withProviders([Clock], () => inject(Clock));
    expectTypeOf(clock).toEqualTypeOf<Clock>();
    expect(clock).toBeInstanceOf(Clock);
  });

  test("an abstract class, provided with an implementation", () => {
    const logger = withProviders([{ provide: Logger, useClass: ConsoleLogger }], () => inject(Logger));
    expectTypeOf(logger).toEqualTypeOf<Logger>();
    expect(logger.log("hi")).toBe("console: hi");
  });

  test("an InjectionToken, typed by the token", () => {
    const url = withProviders([{ provide: API_URL, useValue: "https://api" }], () => inject(API_URL));
    expectTypeOf(url).toEqualTypeOf<string>();
    expect(url).toBe("https://api");
  });

  test("works in field initializers, the intended style", () => {
    class Api {
      readonly url = inject(API_URL);
      readonly clock = inject(Clock);
    }
    const api = withProviders(
      [{ provide: API_URL, useValue: "https://api" }, Clock, Api],
      () => inject(Api),
    );
    expect(api.url).toBe("https://api");
    expect(api.clock).toBeInstanceOf(Clock);
  });

  test("passes the options through, with the matching return type", () => {
    const missing = withProviders([], () => inject(Clock, { optional: true }));
    expectTypeOf(missing).toEqualTypeOf<Clock | null>();
    expect(missing).toBeNull();

    const root = new Injector([adaptProvider({ provide: API_URL, useValue: "root" })]);
    const fromParent = withProviders(
      [{ provide: API_URL, useValue: "child" }],
      () => inject(API_URL, { skipSelf: true }),
      root,
    );
    expect(fromParent).toBe("root");
  });

  test("a class and its class token are the same thing", () => {
    // Provided by class, injected by class: both go through the same adapter.
    const a = withProviders([Clock], () => [inject(Clock), inject(Clock)]);
    expect(a[0]).toBe(a[1]);
  });

  test("still only works inside an injection context", () => {
    expect(() => inject(Clock)).toThrow("inject() must be called in an injection context");
  });

  test("throws for a missing provider, naming the class", () => {
    expect(() => withProviders([], () => inject(Clock))).toThrow("No provider for Clock");
  });
});

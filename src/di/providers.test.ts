// Tests for the public provider types (mostly type-level) and the provide() helper.

import { describe, expect, expectTypeOf, test } from "vitest";
import { inject } from "./inject.ts";
import { Injector, runInInjectionContext } from "./injector.ts";
import { InjectionToken, type Token } from "./internal/inject.ts";
import {
  type ClassProvider,
  type ExistingProvider,
  type FactoryProvider,
  provide,
  type Provider,
  type ProviderToken,
  type ValueProvider,
} from "./providers.ts";

abstract class Logger {
  abstract log(message: string): void;
}
class ConsoleLogger extends Logger {
  log(): void {}
}
class Clock {
  now = 0;
}
class NeedsArguments {
  constructor(readonly value: string) {}
}
const API_URL = new InjectionToken<string>("API_URL");

describe("ProviderToken", () => {
  test("accepts a Token, a class, and an abstract class", () => {
    expectTypeOf(API_URL).toExtend<ProviderToken<string>>();
    expectTypeOf(Clock).toExtend<ProviderToken<Clock>>();
    expectTypeOf(Logger).toExtend<ProviderToken<Logger>>();
  });

  test("a class is a token for its own instances only", () => {
    expectTypeOf(Clock).not.toExtend<ProviderToken<string>>();
    expectTypeOf({ provide: Clock, useValue: "oops" }).not.toExtend<Provider<Clock>>();
  });
});

describe("Provider", () => {
  test("a concrete class on its own", () => {
    expectTypeOf(Clock).toExtend<Provider>();
  });

  test("an abstract class on its own is not enough: it cannot be created", () => {
    expectTypeOf(Logger).not.toExtend<Provider>();
  });

  test("a class whose constructor needs arguments cannot be created by DI", () => {
    expectTypeOf(NeedsArguments).not.toExtend<Provider>();
  });

  test("useClass: an abstract token, a concrete implementation", () => {
    const provider = { provide: Logger, useClass: ConsoleLogger };
    expectTypeOf(provider).toExtend<ClassProvider<Logger>>();
    expectTypeOf(provider).toExtend<Provider>();
    expectTypeOf({ provide: Logger, useClass: Logger }).not.toExtend<ClassProvider<Logger>>();
  });

  test("useValue: the value must match the token's type", () => {
    expectTypeOf({ provide: API_URL, useValue: "https://api" }).toExtend<ValueProvider<string>>();
    expectTypeOf({ provide: API_URL, useValue: 42 }).not.toExtend<ValueProvider<string>>();
  });

  test("useFactory: a function returning the token's type", () => {
    expectTypeOf({ provide: Clock, useFactory: () => new Clock() }).toExtend<FactoryProvider<Clock>>();
    expectTypeOf({ provide: API_URL, useFactory: () => 42 }).not.toExtend<FactoryProvider<string>>();
  });

  test("useExisting: an alias to another token", () => {
    expectTypeOf({ provide: Logger, useExisting: ConsoleLogger }).toExtend<ExistingProvider<Logger>>();
    expectTypeOf({ provide: Logger, useExisting: ConsoleLogger }).toExtend<Provider>();
  });
});

describe("provide()", () => {
  const LOGGER_NAME = new InjectionToken<string>("LOGGER_NAME");

  test("builds the matching object form", () => {
    expect(provide(API_URL, { useValue: "https://api" })).toEqual({ provide: API_URL, useValue: "https://api" });
    expect(provide(Logger, { useClass: ConsoleLogger })).toEqual({ provide: Logger, useClass: ConsoleLogger });
    const factory = () => new Clock();
    expect(provide(Clock, { useFactory: factory })).toEqual({ provide: Clock, useFactory: factory });
    expect(provide(Logger, { useExisting: ConsoleLogger })).toEqual({ provide: Logger, useExisting: ConsoleLogger });
  });

  test("accepts recipes that match the token", () => {
    expectTypeOf(provide(API_URL, { useValue: "https://api" })).toEqualTypeOf<Provider<string>>();
    expectTypeOf(provide(Logger, { useClass: ConsoleLogger })).toEqualTypeOf<Provider<Logger>>();
    expectTypeOf(provide(Clock, { useFactory: () => new Clock() })).toEqualTypeOf<Provider<Clock>>();
    expectTypeOf(provide(Logger, { useExisting: ConsoleLogger })).toEqualTypeOf<Provider<Logger>>();
  });

  test("rejects recipes that do not match the token", () => {
    // @ts-expect-error API_URL is a string token
    provide(API_URL, { useValue: 42 });
    // @ts-expect-error Clock is not a Logger
    provide(Logger, { useClass: Clock });
    // @ts-expect-error the factory must return a string
    provide(API_URL, { useFactory: () => new Date() });
    // @ts-expect-error a Clock token cannot alias a string token
    provide(Clock, { useExisting: LOGGER_NAME });
    // @ts-expect-error an abstract class cannot be created
    provide(Logger, { useClass: Logger });
  });

  test("the providers it builds work like any others", () => {
    const { injector } = Injector.create({
      providers: [
        ConsoleLogger,
        provide(API_URL, { useValue: "https://api" }),
        provide(Logger, { useExisting: ConsoleLogger }),
        provide(LOGGER_NAME, { useFactory: () => `logger for ${inject(API_URL)}` }),
      ],
    });
    runInInjectionContext(injector, () => {
      expect(inject(API_URL)).toBe("https://api");
      expect(inject(Logger)).toBe(inject(ConsoleLogger));
      expect(inject(LOGGER_NAME)).toBe("logger for https://api");
    });
  });
});

import { describe, expect, expectTypeOf, test } from "vitest";
import { adaptProvider, adaptToken, classToken, registerClassToken } from "./adapter.ts";
import { inject, InjectionToken, type Token } from "./internal/inject.ts";
import { Injector } from "./internal/injector.ts";

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

/** An injector built from public provider forms, through the adapter. */
const injectorFor = (...providers: Parameters<typeof adaptProvider>[0][]) =>
  new Injector(providers.map(adaptProvider));

describe("adaptToken", () => {
  test("an InjectionToken stays as is", () => {
    expect(adaptToken(API_URL))
      .toBe(API_URL);
  });

  test("a class (abstract or not) becomes its class token", () => {
    expect(adaptToken(Clock))
      .toBe(classToken(Clock));
    expect(adaptToken(Logger))
      .toBe(classToken(Logger));
  });
});

describe("adaptProvider", () => {
  test("a class on its own is provided as itself", () => {
    const injector = injectorFor(Clock);
    expect(injector.get(classToken(Clock)))
      .toBeInstanceOf(Clock);
  });

  test("useClass creates the given class for the token", () => {
    const injector = injectorFor({ provide: Logger, useClass: ConsoleLogger });
    const logger = injector.get(classToken(Logger));
    expect(logger)
      .toBeInstanceOf(ConsoleLogger);
    expect(logger.log("hi"))
      .toBe("console: hi");
  });

  test("useValue uses the value as is, including falsy values", () => {
    const COUNT = new InjectionToken<number>("COUNT");
    const NOTHING = new InjectionToken<undefined>("NOTHING");
    const config = { debug: true };
    const CONFIG = new InjectionToken<typeof config>("CONFIG");
    const injector = injectorFor(
      { provide: API_URL, useValue: "https://api" },
      { provide: COUNT, useValue: 0 },
      { provide: NOTHING, useValue: undefined },
      { provide: CONFIG, useValue: config },
    );
    expect(injector.get(API_URL))
      .toBe("https://api");
    expect(injector.get(COUNT))
      .toBe(0);
    expect(injector.get(NOTHING))
      .toBeUndefined();
    expect(injector.get(CONFIG))
      .toBe(config);
  });

  test("useFactory calls the factory, which may inject", () => {
    const GREETING = new InjectionToken<string>("GREETING");
    const injector = injectorFor(
      { provide: API_URL, useValue: "https://api" },
      { provide: GREETING, useFactory: () => `calling ${inject(API_URL)}` },
    );
    expect(injector.get(GREETING))
      .toBe("calling https://api");
  });

  test("useExisting is an alias: the same instance as the other token", () => {
    const injector = injectorFor(ConsoleLogger, { provide: Logger, useExisting: ConsoleLogger });
    expect(injector.get(classToken(Logger)))
      .toBe(injector.get(classToken(ConsoleLogger)));
  });

  test("useExisting resolves from the injector that provides the alias", () => {
    const root = injectorFor({ provide: API_URL, useValue: "root" });
    const ALIAS = new InjectionToken<string>("ALIAS");
    const child = new Injector([adaptProvider({ provide: ALIAS, useExisting: API_URL })], root);
    expect(child.get(ALIAS))
      .toBe("root");
  });

  test("each created value is cached like any other", () => {
    const injector = injectorFor(Clock, { provide: Logger, useClass: ConsoleLogger });
    expect(injector.get(classToken(Clock)))
      .toBe(injector.get(classToken(Clock)));
    expect(injector.get(classToken(Logger)))
      .toBe(injector.get(classToken(Logger)));
  });
});

describe("classToken", () => {
  class UserService {}
  abstract class Logger {}

  test("gives the same token for the same class every time", () => {
    expect(classToken(UserService))
      .toBe(classToken(UserService));
  });

  test("gives different tokens for different classes", () => {
    class Other {}
    expect(classToken(UserService)).not.toBe(classToken(Other));
  });

  test("the token is named after the class and typed by its instances", () => {
    const token = classToken(UserService);
    expect(token)
      .toBeInstanceOf(InjectionToken);
    expect(token.name)
      .toBe("UserService");
    expectTypeOf(token)
      .toEqualTypeOf<Token<UserService>>();
  });

  test("works for abstract classes too", () => {
    expectTypeOf(classToken(Logger))
      .toEqualTypeOf<Token<Logger>>();
    expect(classToken(Logger).name)
      .toBe("Logger");
  });
});

describe("registerClassToken", () => {
  test("makes classToken return the given token for that class", () => {
    class Special {}
    const token = new InjectionToken<Special>("SPECIAL");
    registerClassToken(Special, token);
    expect(classToken(Special))
      .toBe(token);
  });

  test("throws if the class already has a token", () => {
    class AlreadyUsed {}
    classToken(AlreadyUsed);
    expect(() => registerClassToken(AlreadyUsed, new InjectionToken<AlreadyUsed>("X")))
      .toThrow(
        "AlreadyUsed already has a token",
      );
  });
});

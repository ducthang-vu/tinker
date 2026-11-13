import { describe, expect, expectTypeOf, test } from "vitest";
import { InjectionToken, type Token } from "./inject.ts";
import { INJECTOR, Injector } from "./injector.ts";

const USER_SERVICE = new InjectionToken<UserService>("UserService");
class UserService {
  users = ["Ada"];
}
const API_URL = new InjectionToken<string>("API_URL");

describe("Injector", () => {
  test("gives the value of a token from its provider's factory", () => {
    const injector = new Injector([{ token: API_URL, factory: () => "https://api.example" }]);
    expect(injector.get(API_URL))
      .toBe("https://api.example");
  });

  test("a class can be used as a token (its type is given explicitly until the class adapter exists)", () => {
    const injector = new Injector([{ token: USER_SERVICE, factory: () => new UserService() }]);
    const service = injector.get(USER_SERVICE);
    expect(service)
      .toBeInstanceOf(UserService);
    expect(service.users)
      .toEqual(["Ada"]);
  });

  test("the result is typed by the token", () => {
    const injector = new Injector([{ token: API_URL, factory: () => "x" }]);
    expectTypeOf(injector.get(API_URL))
      .toEqualTypeOf<string>();
  });

  test("tokens are matched by identity, not by name", () => {
    const other = new InjectionToken<string>("API_URL");
    const injector = new Injector([{ token: API_URL, factory: () => "x" }]);
    expect(() => injector.get(other))
      .toThrow("No provider for API_URL");
  });

  test("uses the first provider registered for a token", () => {
    const injector = new Injector([
      { token: API_URL, factory: () => "first" },
      { token: API_URL, factory: () => "second" },
    ]);
    expect(injector.get(API_URL))
      .toBe("first");
  });

  test("creates each value once per injector, then shares it", () => {
    let calls = 0;
    const injector = new Injector([
      { token: USER_SERVICE, factory: () => (calls++, new UserService()) },
    ]);
    expect(injector.get(USER_SERVICE))
      .toBe(injector.get(USER_SERVICE));
    expect(calls)
      .toBe(1);
  });

  test("each injector that provides a token has its own instance", () => {
    const provider = { token: USER_SERVICE, factory: () => new UserService() };
    const a = new Injector([provider]);
    const b = new Injector([provider]);
    expect(a.get(USER_SERVICE)).not.toBe(b.get(USER_SERVICE));
  });

  test("an injector without a parent is the root", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    const grandchild = new Injector([], child);
    expect(root.isRoot())
      .toBe(true);
    expect(child.isRoot())
      .toBe(false);
    expect(grandchild.isRoot())
      .toBe(false);
  });

  test("each injector exposes its parent", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(child.parent)
      .toBe(root);
    expect(root.parent)
      .toBeUndefined();
  });

  test("has tells whether this injector itself provides a token", () => {
    const root = new Injector([{ token: API_URL, factory: () => "x" }]);
    const child = new Injector([{ token: USER_SERVICE, factory: () => new UserService() }], root);
    expect(child.has(USER_SERVICE))
      .toBe(true);
    expect(child.has(API_URL))
      .toBe(false); // only its own providers
    expect(root.has(API_URL))
      .toBe(true);
  });

  test("has never runs a factory", () => {
    let calls = 0;
    const injector = new Injector([{ token: API_URL, factory: () => (calls++, "x") }]);
    injector.has(API_URL);
    expect(calls)
      .toBe(0);
  });

  test("an error inside a factory is not confused with a missing provider", () => {
    const PAYMENT = new InjectionToken<string>("PAYMENT");
    const child = new Injector([
      {
        token: API_URL,
        factory: () => {
          throw new Error("No provider for PAYMENT");
        },
      },
    ]);
    expect(child.has(API_URL))
      .toBe(true);
    expect(child.has(PAYMENT))
      .toBe(false);
    expect(() => child.get(API_URL))
      .toThrow("No provider for PAYMENT");
  });

  test("throws for a token without a provider", () => {
    expect(() => new Injector([])
      .get(USER_SERVICE))
      .toThrow("No provider for UserService");
  });
});

describe("destroy", () => {
  const CONNECTION = new InjectionToken<Connection>("Connection");
  class Connection {
    closed = 0;
    onDestroy() {
      this.closed++;
    }
  }

  test("calls onDestroy on the values the injector created", () => {
    const injector = new Injector([{ token: CONNECTION, factory: () => new Connection() }]);
    const connection = injector.get(CONNECTION);
    expect(injector.destroyed)
      .toBe(false);
    injector.destroy();
    expect(connection.closed)
      .toBe(1);
    expect(injector.destroyed)
      .toBe(true);
  });

  test("calls onDestroy once per value, however often it was injected", () => {
    const injector = new Injector([{ token: CONNECTION, factory: () => new Connection() }]);
    const connection = injector.get(CONNECTION);
    injector.get(CONNECTION);
    injector.get(CONNECTION);
    injector.destroy();
    expect(connection.closed)
      .toBe(1);
  });

  test("ignores values without an onDestroy() method", () => {
    const NOTHING = new InjectionToken<null>("NOTHING");
    const NOT_A_METHOD = new InjectionToken<{ onDestroy: string }>("NOT_A_METHOD");
    const injector = new Injector([
      { token: API_URL, factory: () => "a string" },
      { token: USER_SERVICE, factory: () => new UserService() },
      { token: NOTHING, factory: () => null },
      { token: NOT_A_METHOD, factory: () => ({ onDestroy: "not a function" }) },
    ]);
    injector.get(API_URL);
    injector.get(USER_SERVICE);
    injector.get(NOTHING);
    injector.get(NOT_A_METHOD);
    expect(() => injector.destroy()).not.toThrow();
  });

  test("runs destroy callbacks, newest first, and only once", () => {
    const injector = new Injector([]);
    const log: string[] = [];
    injector.addDestroyCallback(() => log.push("first"));
    injector.addDestroyCallback(() => log.push("second"));
    injector.destroy();
    injector.destroy();
    expect(log)
      .toEqual(["second", "first"]);
  });

  test("the same callback registered twice runs twice", () => {
    const injector = new Injector([]);
    let calls = 0;
    const callback = () => calls++;
    injector.addDestroyCallback(callback);
    injector.addDestroyCallback(callback);
    injector.destroy();
    expect(calls)
      .toBe(2);
  });

  test("addDestroyCallback returns a function that unregisters the callback", () => {
    const injector = new Injector([]);
    let called = false;
    const unregister = injector.addDestroyCallback(() => (called = true));
    unregister();
    injector.destroy();
    expect(called)
      .toBe(false);
  });

  test("runs every cleanup even if one throws, then re-throws the first error", () => {
    const injector = new Injector([]);
    const log: string[] = [];
    injector.addDestroyCallback(() => log.push("still ran"));
    injector.addDestroyCallback(() => {
      throw new Error("second fails");
    });
    injector.addDestroyCallback(() => {
      throw new Error("first fails");
    });
    expect(() => injector.destroy())
      .toThrow("first fails");
    expect(log)
      .toEqual(["still ran"]);
    expect(injector.destroyed)
      .toBe(true);
  });

  test("destroying a parent destroys its children (and theirs)", () => {
    const root = new Injector([]);
    const child = new Injector([{ token: CONNECTION, factory: () => new Connection() }], root);
    const grandchild = new Injector([], child);
    const connection = child.get(CONNECTION);
    root.destroy();
    expect(child.destroyed)
      .toBe(true);
    expect(grandchild.destroyed)
      .toBe(true);
    expect(connection.closed)
      .toBe(1);
  });

  test("children are destroyed before the parent's own cleanups", () => {
    const root = new Injector([]);
    const log: string[] = [];
    root.addDestroyCallback(() => log.push("root cleanup"));
    const child = new Injector([], root);
    child.addDestroyCallback(() => log.push("child cleanup"));
    root.destroy();
    expect(log)
      .toEqual(["child cleanup", "root cleanup"]);
  });

  test("a child destroyed first leaves the parent alone, and is not destroyed twice", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    let childCleanups = 0;
    child.addDestroyCallback(() => childCleanups++);
    child.destroy();
    expect(root.destroyed)
      .toBe(false);
    root.destroy();
    expect(childCleanups)
      .toBe(1);
  });

  test("a destroyed injector refuses to work", () => {
    const injector = new Injector([{ token: API_URL, factory: () => "x" }]);
    injector.destroy();
    expect(() => injector.get(API_URL))
      .toThrow("Injector has already been destroyed");
    expect(() => injector.has(API_URL))
      .toThrow("Injector has already been destroyed");
    expect(() => injector.addDestroyCallback(() => {}))
      .toThrow("Injector has already been destroyed");
    expect(() => new Injector([], injector))
      .toThrow("Injector has already been destroyed");
  });
});

describe("INJECTOR", () => {
  test("every injector provides itself", () => {
    const injector = new Injector([]);
    expect(injector.has(INJECTOR))
      .toBe(true);
    expect(injector.get(INJECTOR))
      .toBe(injector);
  });

  test("cannot be overridden by a provider", () => {
    const other = new Injector([]);
    const injector = new Injector([{ token: INJECTOR, factory: () => other }]);
    expect(injector.get(INJECTOR))
      .toBe(injector);
  });

  test("each injector in a hierarchy gives itself", () => {
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(child.get(INJECTOR))
      .toBe(child);
    expect(root.get(INJECTOR))
      .toBe(root);
  });

  test("getting it does not register the injector as a value to clean up", () => {
    const injector = new Injector([]);
    injector.get(INJECTOR);
    expect(() => injector.destroy()).not.toThrow();
  });
});

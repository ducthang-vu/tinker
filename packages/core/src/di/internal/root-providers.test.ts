import { describe, expect, test } from "vitest";
import { InjectionToken } from "./inject.ts";
import { Injector } from "./injector.ts";
import { findRootProvider, registerRootProvider } from "./root-providers.ts";
import { valueOrThrow } from "@tinker/functional/v1";

describe("root providers", () => {
  test("registered providers can be looked up by token", () => {
    const TOKEN = new InjectionToken<string>("REGISTERED");
    const provider = { token: TOKEN, factory: () => "x" };
    registerRootProvider(provider);
    expect(findRootProvider(TOKEN)
      .getOrElse(undefined))
      .toBe(provider);
    expect(findRootProvider(new InjectionToken<string>("OTHER"))
      .isNone())
      .toBe(true);
  });

  test("a token can be registered only once", () => {
    const TOKEN = new InjectionToken<string>("TWICE");
    registerRootProvider({ token: TOKEN, factory: () => "a" });
    expect(() => registerRootProvider({ token: TOKEN, factory: () => "b" }))
      .toThrow(
        "TWICE is already provided in root",
      );
  });

  test("a root injector provides them, a child does not (it asks its root)", () => {
    const TOKEN = new InjectionToken<string>("ROOT_ONLY");
    registerRootProvider({ token: TOKEN, factory: () => "from root" });
    const root = new Injector([]);
    const child = new Injector([], root);
    expect(root.has(TOKEN))
      .toBe(true);
    expect(valueOrThrow(root.get(TOKEN)))
      .toBe("from root");
    expect(child.has(TOKEN))
      .toBe(false);
    expect(() => valueOrThrow(child.get(TOKEN)))
      .toThrow("No provider for ROOT_ONLY");
  });

  test("explicit providers of the root win", () => {
    const TOKEN = new InjectionToken<string>("OVERRIDDEN");
    registerRootProvider({ token: TOKEN, factory: () => "registered" });
    const root = new Injector([{ token: TOKEN, factory: () => "explicit" }]);
    expect(valueOrThrow(root.get(TOKEN)))
      .toBe("explicit");
  });

  test("each root injector creates its own instance, once", () => {
    const TOKEN = new InjectionToken<object>("PER_ROOT");
    registerRootProvider({ token: TOKEN, factory: () => ({}) });
    const a = new Injector([]);
    const b = new Injector([]);
    expect(valueOrThrow(a.get(TOKEN)))
      .toBe(valueOrThrow(a.get(TOKEN)));
    expect(valueOrThrow(a.get(TOKEN))).not.toBe(valueOrThrow(b.get(TOKEN)));
  });
});

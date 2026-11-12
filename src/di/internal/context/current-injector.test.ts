import { describe, expect, test } from "vitest";
import { InjectionToken, type Token } from "../inject.ts";
import { Injector } from "../injector.ts";
import { currentInjector, runInInjectionContext } from "./current-injector.ts";

const API_URL = new InjectionToken<string>("API_URL");

describe("injection context", () => {
  test("runInInjectionContext sets the current injector and restores it, also on throw", () => {
    const outer = new Injector([]);
    const inner = new Injector([]);
    expect(currentInjector.get()).toBeUndefined();
    runInInjectionContext(outer, () => {
      expect(currentInjector.get()).toBe(outer);
      expect(() =>
        runInInjectionContext(inner, () => {
          expect(currentInjector.get()).toBe(inner);
          throw new Error("x");
        }),
      ).toThrow("x");
      expect(currentInjector.get()).toBe(outer);
    });
    expect(currentInjector.get()).toBeUndefined();
  });

  test("currentInjector is undefined outside any injection context", () => {
    expect(currentInjector.get()).toBeUndefined();
  });

  test("a factory runs with its own injector as the context", () => {
    let seen: Injector | undefined;
    const injector = new Injector([{ token: API_URL, factory: () => ((seen = currentInjector.get()), "x") }]);
    injector.get(API_URL);
    expect(seen).toBe(injector);
    expect(currentInjector.get()).toBeUndefined();
  });
});

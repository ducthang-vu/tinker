import { describe, expect, expectTypeOf, test } from "vitest";
import { inject, Injectable, InjectionToken, Injector, provide, runInInjectionContext } from "./index.ts";

interface Validator {
  readonly name: string;
}
const VALIDATORS = InjectionToken.multi<Validator>("VALIDATORS");
const named = (name: string): Validator => ({ name });

/** The validators seen from `injector`. */
const validatorsIn = (injector: Injector) =>
  runInInjectionContext(injector, () => inject(VALIDATORS))
    .map((validator) => validator.name);

describe("multi tokens", () => {
  test("is an InjectionToken, marked multi", () => {
    expect(VALIDATORS)
      .toBeInstanceOf(InjectionToken);
    expect(VALIDATORS.multi)
      .toBe(true);
    expect(new InjectionToken<string>("SINGLE").multi)
      .toBe(false);
  });

  test("inject() gives every contribution, in provider order", () => {
    @Injectable()
    class Required implements Validator {
      readonly name = "required";
    }
    const { injector } = Injector.create({
      providers: [
        provide(VALIDATORS, { useClass: Required }),
        provide(VALIDATORS, { useValue: named("max") }),
        provide(VALIDATORS, { useFactory: () => named("min") }),
      ],
    });
    expect(validatorsIn(injector))
      .toEqual(["required", "max", "min"]);
  });

  test("the list is created once per injector, and each contribution's onDestroy runs", () => {
    const destroyed: string[] = [];
    let created = 0;
    class Tracked implements Validator {
      readonly name = `tracked ${++created}`;
      onDestroy() {
        destroyed.push(this.name);
      }
    }
    const ref = Injector.create({ providers: [provide(VALIDATORS, { useClass: Tracked })] });
    const first = runInInjectionContext(ref.injector, () => inject(VALIDATORS));
    const second = runInInjectionContext(ref.injector, () => inject(VALIDATORS));
    expect(first)
      .toBe(second);
    expect(created)
      .toBe(1);
    ref.destroy();
    expect(destroyed)
      .toEqual(["tracked 1"]);
  });

  test("a child's contributions replace its parent's; without any, it sees its parent's", () => {
    const parent = Injector.create({
      providers: [provide(VALIDATORS, { useValue: named("a") }), provide(VALIDATORS, { useValue: named("b") })],
    }).injector;
    const child = Injector.create({ providers: [provide(VALIDATORS, { useValue: named("c") })], parent }).injector;
    const plain = Injector.create({ parent }).injector;
    expect(validatorsIn(child))
      .toEqual(["c"]);
    expect(validatorsIn(plain))
      .toEqual(["a", "b"]);
  });

  test("with no contribution anywhere, the list is empty (whatever the options)", () => {
    const { injector } = Injector.create();
    runInInjectionContext(injector, () => {
      expect(inject(VALIDATORS))
        .toEqual([]);
      expect(inject(VALIDATORS, { optional: true }))
        .toEqual([]);
      expect(inject(VALIDATORS, { self: true }))
        .toEqual([]);
    });
  });

  test("self and skipSelf narrow where the list is taken from", () => {
    const parent = Injector.create({ providers: [provide(VALIDATORS, { useValue: named("parent") })] }).injector;
    const child = Injector.create({ providers: [provide(VALIDATORS, { useValue: named("child") })], parent }).injector;
    const empty = Injector.create({ parent }).injector;
    runInInjectionContext(child, () => {
      expect(inject(VALIDATORS, { skipSelf: true })
        .map((v) => v.name))
        .toEqual(["parent"]);
    });
    runInInjectionContext(empty, () => {
      expect(inject(VALIDATORS, { self: true }))
        .toEqual([]);
    });
  });

  test("a contribution may inject others; a cycle through the list is reported", () => {
    const PREFIX = new InjectionToken<string>("PREFIX");
    const { injector } = Injector.create({
      providers: [
        provide(PREFIX, { useValue: "v-" }),
        provide(VALIDATORS, { useFactory: () => named(`${inject(PREFIX)}a`) }),
      ],
    });
    expect(validatorsIn(injector))
      .toEqual(["v-a"]);

    const cyclic = Injector.create({
      providers: [provide(VALIDATORS, { useFactory: () => named(`${inject(VALIDATORS).length}`) })],
    }).injector;
    expect(() => validatorsIn(cyclic))
      .toThrow("Circular dependency: VALIDATORS → VALIDATORS");
  });

  test("a failing contribution leaves nothing cached: the next inject() tries again", () => {
    let fail = true;
    const { injector } = Injector.create({
      providers: [
        provide(VALIDATORS, {
          useFactory: () => {
            if (fail) {
              throw new Error("not yet");
            }
            return named("ok");
          },
        }),
      ],
    });
    expect(() => validatorsIn(injector))
      .toThrow("not yet");
    fail = false;
    expect(validatorsIn(injector))
      .toEqual(["ok"]);
  });

  test("types: one value per provider, a list from inject(); lists rejected", () => {
    const API_URL = new InjectionToken<string>("API_URL");
    expectTypeOf(() => inject(VALIDATORS))
      .returns
      .toEqualTypeOf<readonly Validator[]>();
    // @ts-expect-error a multi token's provider gives one value, not a list
    provide(VALIDATORS, { useValue: [named("x")] });
    // @ts-expect-error a multi token's provider gives a Validator
    provide(VALIDATORS, { useValue: "x" });
    // @ts-expect-error a single token still checks its value
    provide(API_URL, { useValue: 42 });
    expect(provide(API_URL, { useValue: "https://x" }))
      .toEqual({ provide: API_URL, useValue: "https://x" });
  });
});

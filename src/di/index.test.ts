import { expect, expectTypeOf, test } from "vitest";
import * as api from "./index.ts";
import type {
  ClassProvider,
  CreateInjectorOptions,
  InjectorRef,
  ExistingProvider,
  FactoryProvider,
  Provider,
  ProviderToken,
  Token,
  ValueProvider,
} from "./index.ts";

test("exports exactly the public runtime symbols", () => {
  expect(Object.keys(api).sort()).toEqual([
    "Injectable",
    "InjectionToken",
    "Injector",
    "inject",
    "provide",
    "runInInjectionContext",
  ]);
});

test("exports the public types", () => {
  class Clock {}
  const API_URL = new api.InjectionToken<string>("API_URL");
  expectTypeOf(API_URL).toExtend<Token<string>>();
  expectTypeOf(API_URL).toExtend<ProviderToken<string>>();
  expectTypeOf(Clock).toExtend<ProviderToken<Clock>>();
  expectTypeOf(Clock).toExtend<Provider>();
  expectTypeOf({ provide: Clock, useClass: Clock }).toExtend<ClassProvider<Clock>>();
  expectTypeOf({ provide: API_URL, useValue: "x" }).toExtend<ValueProvider<string>>();
  expectTypeOf({ provide: API_URL, useFactory: () => "x" }).toExtend<FactoryProvider<string>>();
  expectTypeOf({ provide: API_URL, useExisting: API_URL }).toExtend<ExistingProvider<string>>();
  expectTypeOf({ providers: [Clock] }).toExtend<CreateInjectorOptions>();
  expectTypeOf(api.Injector.create()).toEqualTypeOf<InjectorRef>();
});

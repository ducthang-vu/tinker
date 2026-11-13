// The public entry point for dependency injection. Everything users may
// import is listed here explicitly; nothing from ./internal is reachable
// except through it.

// Tokens
export { InjectionToken } from "./internal/inject.ts";
export type { MultiToken, Token } from "./internal/inject.ts";

// Injecting
export { inject } from "./inject.ts";
export { Injector, runInInjectionContext } from "./injector.ts";
export type { CreateInjectorOptions, InjectorRef } from "./injector.ts";
export type { InjectOptions, InjectResult } from "./internal/inject.ts";

// Services
export { Injectable } from "./injectable.ts";
export type { InjectableOptions } from "./injectable.ts";

// Providers
export { provide } from "./providers.ts";
export type {
  ClassProvider,
  ExistingProvider,
  FactoryProvider,
  Provider,
  ProviderRecipe,
  ProviderToken,
  ValueProvider,
} from "./providers.ts";

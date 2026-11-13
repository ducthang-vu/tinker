// Public provider forms: how users tell an injector where values come from.
//
//   UserService                                         a class: provide it, create it
//   { provide: Logger,  useClass: ConsoleLogger }       create another class
//   { provide: API_URL, useValue: "https://…" }         use a fixed value
//   { provide: Clock,   useFactory: () => new Clock() } call a function
//   { provide: Logger,  useExisting: ConsoleLogger }    alias another token
//
// `provide` (and `useExisting`) accept a Token, a class, or an abstract
// class: an abstract class is a natural token for "something with several
// implementations". Classes that are created (`useClass`, the shorthand)
// must be concrete. Internally, every form is turned into a token and a factory.

import type { AbstractClass, Class } from "../utils/types.ts";
import type { Token } from "./internal/inject.ts";

/** What identifies an injectable value: a Token, a class, or an abstract class. */
export type ProviderToken<T> = Token<T> | AbstractClass<T>;

/** Create an instance of `useClass` for `provide`. */
export interface ClassProvider<T> {
  readonly provide: ProviderToken<T>;
  readonly useClass: Class<T>;
}

/** Use `useValue` as is for `provide`. */
export interface ValueProvider<T> {
  readonly provide: ProviderToken<T>;
  readonly useValue: T;
}

/** Call `useFactory` (in the injection context, so it may `inject()`) for `provide`. */
export interface FactoryProvider<T> {
  readonly provide: ProviderToken<T>;
  readonly useFactory: () => T;
}

/** Use the value of another token (`useExisting`) for `provide`: an alias. */
export interface ExistingProvider<T> {
  readonly provide: ProviderToken<T>;
  readonly useExisting: ProviderToken<T>;
}

/**
 * Any provider: a concrete class on its own (provided as itself), or one of
 * the object forms.
 */
export type Provider<T = unknown>
  = | Class<T>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider<T>;

/** How `provide()` creates the value: the object forms without `provide`. */
export type ProviderRecipe<T>
  = | { readonly useClass: Class<T> }
    | { readonly useValue: T }
    | { readonly useFactory: () => T }
    | { readonly useExisting: ProviderToken<T> };

/**
 * A provider whose recipe is checked against its token. A plain `Provider[]`
 * list cannot do that (each entry would need its own type), so a mismatch
 * like `{ provide: API_URL, useValue: 42 }` would compile; with
 * `provide(API_URL, { useValue: 42 })` it does not.
 *
 * The value type `T` comes from the token only (`NoInfer` on the recipe), so
 * a mismatch is reported instead of being "explained" by widening `T`.
 */
export function provide<T>(
  token: ProviderToken<T>,
  recipe: ProviderRecipe<NoInfer<T>>,
): Provider<T> {
  return { provide: token, ...recipe } as Provider<T>;
}

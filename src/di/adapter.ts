// The adapter: turns what users write (public provider forms and tokens,
// see ./providers.ts) into what the internals understand (Tokens, and
// providers made of a token and a factory). It lives outside ./internal
// because it depends on the public types: internal code never imports
// from the public side.
//
// Classes become tokens here: the internals only know Tokens, so each class
// gets one, always the same token for the same class (tokens are matched by
// identity).

import type { AbstractClass } from "../utils/types.ts";
import type { Provider, ProviderToken } from "./providers.ts";
import { inject, InjectionToken, type Token } from "./internal/inject.ts";
import type { Provider as InternalProvider } from "./internal/provider-records.ts";

/** One token per class. Weak, so classes can still be garbage-collected. */
const tokens = new WeakMap<AbstractClass, Token<unknown>>();

/** The token for `type`'s instances: the same token every time. */
export function classToken<T>(type: AbstractClass<T>): Token<T> {
  let token = tokens.get(type);
  if (!token) {
    token = new InjectionToken<T>(type.name);
    tokens.set(type, token);
  }
  return token as Token<T>;
}

/**
 * Make `classToken(type)` return `token`, an existing token, instead of a new
 * one. Lets a public class stand for an internal token (e.g. the public
 * `Injector` class for INJECTOR) without the internal side importing it.
 * Throws if `type` already has a token.
 */
export function registerClassToken<T>(type: AbstractClass<T>, token: Token<T>): void {
  if (tokens.has(type)) {
    throw new Error(`${type.name} already has a token`);
  }
  tokens.set(type, token);
}

/** An InjectionToken as is; a class (abstract or not) as the token for its instances. */
export function adaptToken<T>(token: ProviderToken<T>): Token<T> {
  // InjectionToken is the only Token implementation, so anything else is a class.
  return token instanceof InjectionToken ? token : classToken(token as AbstractClass<T>);
}

/** Turn any public provider form into a token and a factory. */
export function adaptProvider<T>(provider: Provider<T>): InternalProvider<T> {
  if (typeof provider === "function") {
    // A class on its own: provided as itself.
    return { token: classToken(provider), factory: () => new provider() };
  }
  const token = adaptToken(provider.provide);
  if ("useClass" in provider) {
    const useClass = provider.useClass;
    return { token, factory: () => new useClass() };
  }
  if ("useValue" in provider) {
    const value = provider.useValue;
    return { token, factory: () => value };
  }
  if ("useFactory" in provider) {
    return { token, factory: provider.useFactory };
  }
  // useExisting: an alias, resolved from the injector that provides it.
  const existing = adaptToken(provider.useExisting);
  return { token, factory: () => inject(existing) };
}

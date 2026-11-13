// Root providers: providers that every root injector (an injector without a
// parent) uses for tokens it does not provide itself. This is how a service
// marked `providedIn: "root"` is available everywhere without being listed.
//
// A root injector adds such a provider to its own records on first use, so
// each root injector creates (and destroys) its own instance, and explicit
// providers always win.

import { Maybe } from "../../functional/index.ts";
import type { Token } from "./inject.ts";
import type { Provider } from "./provider-records.ts";

const rootProviders = new Map<Token<unknown>, Provider<unknown>>();

/** Make `provider` available in every root injector. Throws if its token already has one. */
export function registerRootProvider<T>(provider: Provider<T>): void {
  if (rootProviders.has(provider.token)) {
    throw new Error(`${provider.token.name} is already provided in root`);
  }
  rootProviders.set(provider.token, provider as Provider<unknown>);
}

/** The root provider for `token`, if it has one. */
export function findRootProvider<T>(token: Token<T>): Maybe<Provider<T>> {
  return Maybe.fromNullable(rootProviders.get(token) as Provider<T> | undefined);
}

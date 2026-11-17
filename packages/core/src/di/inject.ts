// The public inject(): accepts any public token (a class, an abstract class,
// or an InjectionToken), turns it into an internal Token with the adapter,
// and resolves it from the current injection context.

import type { ProviderToken } from "./providers.ts";
import { adaptToken } from "./adapter.ts";
import {
  inject as internalInject,
  type InjectOptions,
  type InjectResult,
} from "./internal/inject.ts";

/**
 * The value for `token`, looked up from the current injector and then its
 * parents (narrowed by `options`). Only works inside an injection context
 * (while a value is being created), so dependencies are declared up front.
 * For a class, the value's type is inferred from the class's instances.
 */
export function inject<T, O extends InjectOptions = {}>(
  token: ProviderToken<T>,
  options?: O,
): InjectResult<T, O> {
  return internalInject(adaptToken(token), options);
}

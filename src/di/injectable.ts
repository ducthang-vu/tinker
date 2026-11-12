// The @Injectable decorator: marks a class as a service.
//
//   @Injectable({ providedIn: "root" })   available in every root injector,
//   class Store {}                        without being listed in any providers
//
//   @Injectable()                         only a marker: still has to be
//   class FormState {}                    listed in some providers
//
// The metadata is stored as a static property of the class, like @Component.

import { defineMetadata, ownMetadata } from "../utils/metadata.ts";
import type { AbstractClass, Class } from "../utils/types.ts";
import { adaptProvider } from "./adapter.ts";
import { registerRootProvider } from "./internal/root-providers.ts";

/** What a service declares about itself. */
export interface InjectableOptions {
  /** `"root"`: available in every root injector, without being listed in providers. */
  readonly providedIn?: "root";
}

/** The key of the static metadata property (module-private). */
const INJECTABLE_METADATA: unique symbol = Symbol("injectable metadata");

/**
 * Class decorator: marks the class as a service. With `providedIn: "root"`,
 * every root injector can create it, once, when it is first injected.
 * The class must be concrete, with a constructor taking no arguments
 * (dependencies come from `inject()` in its fields).
 */
export function Injectable(options: InjectableOptions = {}) {
  const recorded: InjectableOptions = Object.freeze({ ...options });
  return function <C extends Class<unknown>>(target: C, _context: ClassDecoratorContext<C>): void {
    defineMetadata(target, INJECTABLE_METADATA, recorded);
    if (recorded.providedIn === "root") {
      registerRootProvider(adaptProvider(target));
    }
  };
}

/** The injectable metadata of `type`, or `undefined` if it is not decorated with @Injectable. */
export function getInjectableMetadata(type: AbstractClass): InjectableOptions | undefined {
  return ownMetadata(type, INJECTABLE_METADATA);
}

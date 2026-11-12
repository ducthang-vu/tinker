// Class metadata stored as static properties, used by Tinker's decorators
// (@Directive, @Component, @Injectable).
//
// Each kind of metadata has its own private symbol key, so it cannot clash
// with a class's own static fields. The property is read-only and hidden,
// and only a class's *own* property counts: static properties are
// inherited, but a subclass has metadata only if it is decorated itself.

import type { AbstractClass } from "./types.ts";

/** Store `value` as a hidden, read-only static property of `target`. */
export function defineMetadata(target: AbstractClass, key: symbol, value: object): void {
  Object.defineProperty(target, key, {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

/** Read the static property `key` of `type` itself (not inherited), or `undefined`. */
export function ownMetadata<T>(type: AbstractClass, key: symbol): T | undefined {
  return Object.hasOwn(type, key) ? (type as unknown as Record<symbol, T>)[key] : undefined;
}

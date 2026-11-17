// General-purpose utility types, shared across Tinker.

/** Any class (constructor), including abstract ones, whose instances are `T`. */
export type AbstractClass<T = unknown> = abstract new (...args: never[]) => T;

/** A concrete class whose instances are `T`, created with `new` and no arguments. */
export type Class<T> = new () => T;

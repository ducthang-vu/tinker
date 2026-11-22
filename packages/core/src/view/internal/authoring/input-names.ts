// The template names of a class's inputs, by property. A class knows them without an instance:
// the compiler reads each `input(…, { name })` of a class and registers them when the class is
// defined, so a test can build a mock of the class that answers to the names templates use.

import type { AbstractClass } from "../../../utils/types.ts";

const names = new WeakMap<AbstractClass, Readonly<Record<string, string>>>();

/**
 * Register the template names of the inputs of `type`, by property: `{ label: "title" }` for
 * `label = input("", { name: "title" })`. The compiler calls this; it is not for app code.
 */
export function registerInputNames(
  type: AbstractClass,
  byProperty: Readonly<Record<string, string>>,
): void {
  names.set(type, { ...byProperty });
}

/** The template names of the inputs of `type`, by property: only those given a `name`. */
export function inputNamesOf(type: AbstractClass): Readonly<Record<string, string>> {
  return names.get(type) ?? {};
}

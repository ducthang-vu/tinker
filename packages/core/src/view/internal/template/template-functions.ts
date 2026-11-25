// The template functions of each component instance, by name. A bare call such as `format(x)` in
// a template reads one of these when the component has no member of that name. Recorded per
// instance, so the evaluator reaches them through the scope's component alone.

import type { TemplateFunctionContract } from "../authoring/template-function.ts";
import { match, None, Some, type Maybe } from "@tinker/functional";

const registry = new WeakMap<object, ReadonlyMap<string, TemplateFunctionContract>>();

/**
 * Record the template functions of `component` by name. Called once, when the component is made.
 *
 * @param component The component instance the functions belong to.
 * @param functions The template functions it imports, by the name its template calls them by.
 */
export function registerTemplateFunctions(
  component: object,
  functions: ReadonlyMap<string, TemplateFunctionContract>,
): void {
  registry.set(component, functions);
}

/**
 * The template function `component` imports under `name`, if any.
 *
 * @param component The component instance the template belongs to.
 * @param name The name the template calls the function by.
 * @returns The function, or None when the component imports none by that name.
 */
export function templateFunctionOf(
  component: object,
  name: string,
): Maybe<TemplateFunctionContract> {
  const fn = registry.get(component)
    ?.get(name);
  return fn === undefined ? None.of() : Some.of(fn);
}

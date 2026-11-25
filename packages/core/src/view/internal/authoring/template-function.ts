// Template functions: classes a template calls by name, such as `{{ format(price()) }}`.
//
//   @TemplateFunction("format")
//   class DateFormat implements TemplateFunctionContract<[Date], string> {
//     private readonly clock = inject(Clock);
//
//     call(date: Date): string { /* reads this.clock() */ }
//   }
//
//   @Component({ selector: "tk-price", template: "{{ format(date()) }}", imports: [DateFormat] })
//
// A component lists its template functions in `imports`, as it lists directives. Each one is
// created once per component, in the component's injector, so its inject() calls and onDestroy()
// work as they do for any injectable: the decorator makes the class injectable. The name is what
// the template calls, so it must be an identifier. A bare name, such as `format` in `format(x)` or
// `filter(isOpen)`, reads the function when the component has no member of that name: a member
// wins. Read on its own, the function is a value that can be passed as an argument.

import { Injectable } from "../../../di/index.ts";
import { defineMetadata, ownMetadata } from "../../../utils/metadata.ts";
import type { AbstractClass, Class } from "../../../utils/types.ts";
import { isSome, map, type Maybe } from "@tinker/functional";

/** What a template function is: a `call()` method, with the types of its arguments and result. */
export interface TemplateFunctionContract<A extends unknown[] = unknown[], R = unknown> {
  call(...args: A): R;
}

/** The key of the static metadata property (module-private). */
const TEMPLATE_FUNCTION_METADATA: unique symbol = Symbol("template function metadata");

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Class decorator: makes the class a template function, which a template calls by `name`. It is
 * also injectable, so it is created through DI, once per component that imports it.
 *
 * @param name The name a template calls it by: an identifier, such as `format`.
 * @returns The class decorator. The class must have a `call()` method.
 * @throws If `name` is not an identifier.
 */
export function TemplateFunction(name: string) {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`@TemplateFunction("${name}"): the name must be an identifier, such as "format"`);
  }
  return function <C extends Class<TemplateFunctionContract>>(
    target: C,
    context: ClassDecoratorContext<C>,
  ): void {
    // Checked here, where the class is declared: a missing call() would only fail at render time.
    if (typeof target.prototype.call !== "function") {
      throw new Error(`${target.name} is a template function, so it needs a call() method`);
    }
    Injectable()(target, context);
    defineMetadata(target, TEMPLATE_FUNCTION_METADATA, Object.freeze({ name }));
  };
}

/**
 * The name `type` is a template function by, if it is decorated with @TemplateFunction.
 *
 * @param type The class to look at.
 * @returns The name, or None when the class is not a template function.
 */
export function templateFunctionName(type: AbstractClass): Maybe<string> {
  return map(
    ownMetadata<{ readonly name: string }>(type, TEMPLATE_FUNCTION_METADATA),
    (metadata) => metadata.name,
  );
}

/**
 * Whether `type` is a template function, so it is imported as one rather than as a directive.
 *
 * @param type The class to look at.
 * @returns True when the class is decorated with @TemplateFunction.
 */
export function isTemplateFunction(type: AbstractClass): boolean {
  return isSome(templateFunctionName(type));
}

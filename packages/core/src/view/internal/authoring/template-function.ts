// Template functions: classes a template calls by name, such as `{{ format(price()) }}`.
//
//   @TemplateFunction("format")
//   class DateFormat implements TemplateFunctionContract<[Date], string> {
//     private readonly formatter = inject(DateFormatter);
//
//     call(date: Date): string { return this.formatter.format(date); }
//   }
//
//   @Component({ selector: "tk-price", template: "{{ format(date()) }}", imports: [DateFormat] })
//
// A call sees only its arguments. It runs untracked: a signal read inside `call()` is not a
// dependency of the view, so it never makes the view re-run, and a memoised call is not run again
// when it changes. The template reads the signals and passes their values in, as `date()` above.
// Calls are memoised unless the decorator sets `memoise: false`.
//
// A component lists its template functions in `imports`, as it lists directives. Each one is
// created once per component, in the component's injector, so its inject() calls and onDestroy()
// work as they do for any injectable: the decorator makes the class injectable. The name is what
// the template calls, so it must be an identifier. A bare name, such as `format` in `format(x)` or
// `filter(isOpen)`, reads the function when the component has no member of that name. Read on its
// own, the function is a value that can be passed as an argument.
//
// A member with the same name as an imported function is an error at build time (when the build
// can read the class), and a warning in development mode at run time. Two imports with one name
// are an error both at build time and at run time.

import { Injectable } from "../../../di/index.ts";
import { defineMetadata, ownMetadata } from "../../../utils/metadata.ts";
import type { AbstractClass, Class } from "../../../utils/types.ts";
import { isSome, map, match, type Maybe } from "@tinker/functional";

/** What a template function is: a `call()` method, with the types of its arguments and result. */
export interface TemplateFunctionContract<A extends unknown[] = unknown[], R = unknown> {
  call(...args: A): R;
}

/** What the decorator takes besides the name. */
export interface TemplateFunctionOptions {
  /**
   * Whether a call with the same arguments as last time gives the last result, without running
   * `call()` again. On by default. With `false`, `call()` runs each time the view re-runs: for a
   * function that reads something the view cannot track, such as the clock or the locale.
   *
   * Either way, a call runs untracked: a signal read inside `call()` does not make the view re-run,
   * and `memoise: false` does not change that. Read the signal in the template and pass its value
   * as an argument: `{{ scaled(2, factor()) }}`, not a `scaled(2)` that reads `factor()` itself.
   */
  readonly memoise?: boolean;
}

interface TemplateFunctionMetadata {
  readonly name: string;
  readonly memoise: boolean;
}

/** The key of the static metadata property (module-private). */
const TEMPLATE_FUNCTION_METADATA: unique symbol = Symbol("template function metadata");

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Class decorator: makes the class a template function, which a template calls by `name`. It is
 * also injectable, so it is created through DI, once per component that imports it. Its `call()`
 * depends only on its arguments: it runs untracked, so a signal read inside it does not make the
 * view re-run.
 *
 * @param name The name a template calls it by: an identifier, such as `format`.
 * @returns The class decorator. The class must have a `call()` method.
 * @throws If `name` is not an identifier.
 */
export function TemplateFunction(name: string, options: TemplateFunctionOptions = {}) {
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
    defineMetadata(
      target,
      TEMPLATE_FUNCTION_METADATA,
      Object.freeze({ name, memoise: options.memoise !== false }),
    );
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
    ownMetadata<TemplateFunctionMetadata>(type, TEMPLATE_FUNCTION_METADATA),
    (metadata) => metadata.name,
  );
}

/**
 * Whether the template function `type` is memoised: on unless its decorator sets `memoise: false`.
 *
 * @param type The class to look at, a template function.
 * @returns True when its calls are memoised.
 */
export function templateFunctionMemoised(type: AbstractClass): boolean {
  return match(ownMetadata<TemplateFunctionMetadata>(type, TEMPLATE_FUNCTION_METADATA), {
    Some: (metadata) => metadata.memoise,
    None: () => false,
  });
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

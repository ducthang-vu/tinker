// Host bindings: what a directive (or component) does on its host element,
// from the `host` option of its decorator.
//
// For now, event listeners calling a method of the instance (with or
// without the event), and class bindings turning a class of the host
// element on while an expression of the instance is truthy:
//
//   host: { "(click)": "toggle()" }
//   host: { "(click)": "toggle($event)" }
//   host: { "[class.open]": "isOpen()" }
//
// Anything else is rejected with a clear error. Property and attribute
// bindings (`[prop]`, `[attr.x]`), `[style.x]` and full handler expressions
// can be added here later. Class names keep their case: unlike templates,
// host bindings are not read by the browser's HTML parser.

import { type EitherError, Maybe } from "../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { type Expression, ExpressionParser } from "../template/expression.ts";
import type { View } from "../runtime/view.ts";

/** One parsed `"(event)": "method(...)"` entry. */
export interface HostListener {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  /** The method of the instance to call, e.g. `"toggle"`. */
  readonly method: string;
  /** Whether the method receives the event (`"toggle($event)"`). */
  readonly passEvent: boolean;
}

/** One parsed `"[class.name]": "expression"` entry. */
export interface HostClassBinding {
  /** The class, e.g. `"open"`. */
  readonly name: string;
  /** Turns the class on while truthy; its names are read from the instance. */
  readonly expression: Expression;
}

export class HostBindings {
  /** The parsed event listeners. */
  readonly listeners: readonly HostListener[];
  /** The parsed class bindings. */
  readonly classes: readonly HostClassBinding[];

  /**
   * Parse a `host` option. Throws for anything but `"(event)": "method()"`,
   * `"(event)": "method($event)"` or `"[class.name]": "expression"`,
   * reporting every invalid entry at once (an AggregateError holding one
   * error each).
   */
  constructor(host: Readonly<Record<string, string>> = {}) {
    const parsed = Object.entries(host)
      .map(([key, value]) => parseEntry(key, value));
    const errors = parsed.flatMap((result) =>
      result.match({ left: (error) => [error], right: () => [] }),
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, errors.map((error) => error.message)
        .join("\n"));
    }
    const entries = parsed.map((result) => result.getOrThrow());
    this.listeners = entries.filter((entry): entry is HostListener => "event" in entry);
    this.classes = entries.filter((entry): entry is HostClassBinding => "expression" in entry);
  }

  /**
   * Apply the bindings of `instance` to `element`: listen for each event and
   * call the method. Every listener is removed when `view` is destroyed.
   * Throws if the instance has no such method.
   */
  attach(instance: object, element: Element, renderer: Renderer, view: View<unknown>): void {
    for (const { event, method, passEvent } of this.listeners) {
      const handler = Maybe.of((instance as Record<string, unknown>)[method])
        .filter((value) => typeof value === "function")
        .getOrThrow(
          () => new Error(`${instance.constructor.name} has no method "${method}" for host listener "(${event})"`),
        );
      const stop = renderer.listen(element, event, (e) =>
        passEvent ? handler.call(instance, e) : handler.call(instance),
      );
      view.addDestroyCallback(stop);
    }
  }
}

const LISTENER_KEY = /^\(([\w.-]+)\)$/;
const CLASS_KEY = /^\[class\.([^\]\s]+)\]$/;

/** One `host` entry, or the error explaining why it is not supported. */
function parseEntry(key: string, value: string): EitherError<HostListener | HostClassBinding> {
  return Maybe.fromNullable(CLASS_KEY.exec(key)?.[1])
    .match<EitherError<HostListener | HostClassBinding>>({
      some: (name) => ExpressionParser.parse(value)
        .mapLeft((error) => new Error(`${error.message}, in host binding "${key}"`))
        .map((expression) => ({ name, expression })),
      none: () => parseListener(key, value),
    });
}
const METHOD_CALL = /^\s*([A-Za-z_$][\w$]*)\(\s*(\$event)?\s*\)\s*$/;

/** One `host` entry as a listener, or the error explaining why it is not supported. */
function parseListener(key: string, handler: string): EitherError<HostListener> {
  const event = Maybe.fromNullable(LISTENER_KEY.exec(key)?.[1])
    .toEither(
      new Error(
        `Unsupported host binding "${key}": only "(event)" listeners and "[class.name]" bindings `
        + "are supported for now",
      ),
    );
  const call = Maybe.fromNullable(METHOD_CALL.exec(handler))
    .toEither(
      new Error(`Unsupported host handler "${handler}": write "method()" or "method($event)"`),
    );
  return event.flatMap((name) =>
    call.map((match) => ({ event: name, method: match[1]!, passEvent: match[2] !== undefined })),
  );
}

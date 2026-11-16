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

import { type EitherError, Maybe } from "../../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
import { parseHandler } from "../template/handler.ts";
import { type EventModifier, parseEventName } from "../template/event-modifiers.ts";
import { listenWithModifiers } from "../runtime/event-listener.ts";
import { type Expression, ExpressionParser } from "../template/expression.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import type { View } from "../runtime/view.ts";

/** One parsed `"(event)": "method(...)"` entry. */
export interface HostListener {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  /** Its modifiers, e.g. `.prevent`, in the order written. */
  readonly modifiers: readonly EventModifier[];
  /** The method of the instance to call, e.g. `"toggle"`. */
  readonly method: string;
  /** Whether the method receives the event (`"toggle($event)"`). */
  readonly passEvent: boolean;
}

/**
 * One parsed `"[class.name]"`, `"[style.name]"` or `"[attr.name]"` entry: its
 * `name` gets the value of `expression`, read from the instance.
 */
export interface HostValueBinding {
  readonly kind: "class" | "style" | "attribute";
  readonly name: string;
  readonly expression: Expression;
}

export class HostBindings {
  /** The parsed event listeners. */
  readonly listeners: readonly HostListener[];
  /** The parsed class bindings. */
  readonly classes: readonly HostValueBinding[];
  /** The parsed style bindings. */
  readonly styles: readonly HostValueBinding[];
  /** The parsed attribute bindings. */
  readonly attributes: readonly HostValueBinding[];

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
    const values = entries.filter((entry): entry is HostValueBinding => "kind" in entry);
    this.classes = values.filter((value) => value.kind === "class");
    this.styles = values.filter((value) => value.kind === "style");
    this.attributes = values.filter((value) => value.kind === "attribute");
  }

  /**
   * Apply the bindings of `instance` to `element`: listen for each event and
   * call the method. Every listener is removed when `view` is destroyed.
   * Throws if the instance has no such method.
   */
  attach(instance: object, element: Element, renderer: Renderer, view: View): void {
    for (const { event, method, passEvent, modifiers } of this.listeners) {
      const handler = Maybe.of((instance as Record<string, unknown>)[method])
        .filter((value) => typeof value === "function")
        .getOrThrow(
          () => new Error(`${instance.constructor.name} has no method "${method}" for host listener "(${event})"`),
        );
      const stop = listenWithModifiers(renderer, element, { event, modifiers }, (e) =>
        passEvent ? handler.call(instance, e) : handler.call(instance),
      );
      view.addDestroyCallback(stop);
    }
  }
}

const LISTENER_KEY = /^\(([^)\s]+)\)$/;
const VALUE_KEY = /^\[(class|style|attr)\.([^\]\s]+)\]$/;

/** One `host` entry, or the error explaining why it is not supported. */
function parseEntry(key: string, value: string): EitherError<HostListener | HostValueBinding> {
  const match = VALUE_KEY.exec(key);
  if (!match) {
    return parseListener(key, value);
  }
  const kind = match[1] === "attr" ? "attribute" : (match[1] as "class" | "style");
  return ExpressionParser.parse(value)
    .mapLeft((error) => new Error(`${error.message}, in host binding "${key}"`))
    .map((expression) => ({ kind, name: match[2]!, expression }));
}

/** One `host` entry as a listener, or the error explaining why it is not supported. */
function parseListener(key: string, handler: string): EitherError<HostListener> {
  const source = Maybe.fromNullable(LISTENER_KEY.exec(key)?.[1])
    .toEither(
      new Error(
        `Unsupported host binding "${key}": only "(event)" listeners and "[class.name]", `
        + "\"[style.name]\" and \"[attr.name]\" bindings are supported for now",
      ),
    );
  return source
    .flatMap((name) => parseEventName(name, `host listener "${key}"`))
    .flatMap((listener) =>
      parseHandler(handler, "host handler")
        .map((call) => ({ ...listener, ...call })),
    );
}

// Host bindings: what a directive (or component) does on its host element,
// from the `host` option of its decorator.
//
// For now, event listeners calling a method of the instance, with the same
// handlers as templates (see handler.ts), and class bindings turning a class
// of the host element on while an expression of the instance is truthy:
//
//   host: { "(click)": "toggle()" }
//   host: { "(click)": "select(item.id, $event)" }
//   host: { "[class.open]": "isOpen()" }
//
// Attribute bindings set any attribute, URLs included, with the same checks
// as in templates (see runtime/attribute-binding.ts):
//
//   host: { "[attr.href]": "url()" }
//
// Anything else is rejected with a clear error. Property bindings (`[prop]`)
// can be added here later. Class names keep their case: unlike templates,
// host bindings are not read by the browser's HTML parser.

import type { Renderer } from "../renderer.ts";
import { type Handler, parseHandler, requireMethod, runHandler } from "../template/handler.ts";
import { Scope } from "../template/scope.ts";
import { isEventAttribute } from "../runtime/url-safety.ts";
import { type EventModifier, parseEventName } from "../template/event-modifiers.ts";
import { listenWithModifiers } from "../runtime/event-listener.ts";
import { type Expression, ExpressionParser } from "../template/expression.ts";
import type { ComponentView } from "../runtime/component-view.ts";
import type { View } from "../runtime/view.ts";
import { match, mapLeft, map, flatMap, Left, Right, type Either, pipe, valueOrThrow, use } from "@tinker/functional";

/** One parsed `"(event)": "method(...)"` entry. */
export interface HostListener {
  /** The DOM event, e.g. `"click"`. */
  readonly event: string;
  /** Its modifiers, e.g. `.prevent`, in the order written. */
  readonly modifiers: readonly EventModifier[];
  /** What the listener does: a call of a method of the instance. */
  readonly handler: Handler;
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

  private constructor(entries: readonly (HostListener | HostValueBinding)[]) {
    this.listeners = entries.filter((entry): entry is HostListener => "event" in entry);
    const values = entries.filter((entry): entry is HostValueBinding => "kind" in entry);
    this.classes = values.filter((value) => value.kind === "class");
    this.styles = values.filter((value) => value.kind === "style");
    this.attributes = values.filter((value) => value.kind === "attribute");
  }

  /**
   * Parse a `host` option: `"(event)": "method()"`, `"(event)": "method($event)"`, or
   * `"[class.name]"`, `"[style.name]"` and `"[attr.name]"` with an expression. Anything else
   * is a Left holding an AggregateError with one error per invalid entry, so every
   * mistake is reported at once.
   */
  static parse(host: Readonly<Record<string, string>> = {}): Either<HostBindings, AggregateError> {
    const parsed = Object.entries(host)
      .map(([key, value]) => parseEntry(key, value));
    const errors = parsed.flatMap((result) =>
      match(result, { Left: (error) => [error], Right: () => [] }));
    if (errors.length > 0) {
      return Left.of(new AggregateError(errors, errors.map((error) => error.message)
        .join("\n")));
    }
    // No entry failed (that case returned above), so every result is a Right.
    const entries = parsed.map((result) => valueOrThrow(result));
    return Right.of(new HostBindings(entries));
  }

  /**
   * Apply the bindings of `instance` to `element`: listen for each event and
   * call the method. Every listener is removed when `view` is destroyed.
   * Throws if the instance has no such method.
   */
  attach(instance: object, element: Element, renderer: Renderer, view: View): void {
    for (const { event, handler, modifiers } of this.listeners) {
      if (handler.target === undefined) {
        requireMethod(instance, handler.method, `host listener "(${event})"`);
      }
      const stop = listenWithModifiers(renderer, element, { event, modifiers }, (e) =>
        runHandler(handler, new Scope(instance), e),
      );
      view.addDestroyCallback(stop);
    }
  }
}

const LISTENER_KEY = /^\(([^)\s]+)\)$/;
const VALUE_KEY = /^\[(class|style|attr)\.([^\]\s]+)\]$/;

/** One `host` entry, or the error explaining why it is not supported. */
function parseEntry(key: string, value: string): Either<HostListener | HostValueBinding, Error> {
  const match = VALUE_KEY.exec(key);
  if (!match) {
    return parseListener(key, value);
  }
  if (match[1] === "attr" && isEventAttribute(match[2]!)) {
    return Left.of(new Error(
      `[attr.${match[2]}] in host binding "${key}": event attributes cannot be bound; use "(${match[2]!.slice(2)})" instead`,
    ));
  }
  const kind = match[1] === "attr" ? "attribute" : (match[1] as "class" | "style");
  return pipe(
    mapLeft(ExpressionParser.parse(value), (error) => new Error(`${error.message}, in host binding "${key}"`)),
    map((expression: Expression) => ({ kind, name: match[2]!, expression })),
  );
}

/** One `host` entry as a listener, or the error explaining why it is not supported. */
function parseListener(key: string, handler: string): Either<HostListener, Error> {
  const listenerName = LISTENER_KEY.exec(key)?.[1];
  const source: Either<string, Error> = listenerName === undefined
    ? Left.of(new Error(
        `Unsupported host binding "${key}": only "(event)" listeners and "[class.name]", `
        + "\"[style.name]\" and \"[attr.name]\" bindings are supported for now",
      ))
    : Right.of(listenerName);
  return pipe(
    source,
    flatMap((name) => parseEventName(name, `host listener "${key}"`)),
    flatMap((listener) => withHandler(listener, handler)),
  );
}

/** `listener` with its handler parsed from `handler` (the source of a method call). */
function withHandler<L extends object>(
  listener: L,
  handler: string,
): Either<L & { readonly handler: Handler }, Error> {
  return map(parseHandler(handler, "host handler"), (parsed: Handler) => ({ ...listener, handler: parsed }));
}

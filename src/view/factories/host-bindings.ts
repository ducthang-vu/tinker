// Host bindings: what a directive (or component) does on its host element,
// from the `host` option of its decorator.
//
// For now only event listeners, calling a method of the instance with or
// without the event:
//
//   host: { "(click)": "toggle()" }
//   host: { "(click)": "toggle($event)" }
//
// Anything else is rejected with a clear error. Property, class and
// attribute bindings (`[prop]`, `[class.x]`, `[attr.x]`) and full handler
// expressions can be added here later.

import { type EitherError, Maybe } from "../../functional/index.ts";
import type { Renderer } from "../renderer.ts";
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

export class HostBindings {
  /** The parsed event listeners. */
  readonly listeners: readonly HostListener[];

  /**
   * Parse a `host` option. Throws for anything but
   * `"(event)": "method()"` or `"(event)": "method($event)"`, reporting
   * every invalid entry at once (an AggregateError holding one error each).
   */
  constructor(host: Readonly<Record<string, string>> = {}) {
    const parsed = Object.entries(host)
      .map(([key, handler]) => parseListener(key, handler));
    const errors = parsed.flatMap((result) =>
      result.match({ left: (error) => [error], right: () => [] }),
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, errors.map((error) => error.message)
        .join("\n"));
    }
    this.listeners = parsed.map((result) => result.getOrThrow());
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
const METHOD_CALL = /^\s*([A-Za-z_$][\w$]*)\(\s*(\$event)?\s*\)\s*$/;

/** One `host` entry as a listener, or the error explaining why it is not supported. */
function parseListener(key: string, handler: string): EitherError<HostListener> {
  const event = Maybe.fromNullable(LISTENER_KEY.exec(key)?.[1])
    .toEither(
      new Error(`Unsupported host binding "${key}": only "(event)" listeners are supported for now`),
    );
  const call = Maybe.fromNullable(METHOD_CALL.exec(handler))
    .toEither(
      new Error(`Unsupported host handler "${handler}": write "method()" or "method($event)"`),
    );
  return event.flatMap((name) =>
    call.map((match) => ({ event: name, method: match[1]!, passEvent: match[2] !== undefined })),
  );
}

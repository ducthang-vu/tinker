// Handlers: what an event does. A handler is one call of a method of the
// component, with any arguments the template can express:
//
//   method()                     call the method
//   method($event)               call it with the event
//   select(item.id, $event.key)  arguments are ordinary expressions
//
// `$event` is the DOM event, or the value an output emits. Used by template
// event bindings `(name)="..."` and by host listeners `"(click)": "..."`.

import { Either, type EitherError } from "@tinker/functional";
import { signal, type ReadonlySignal } from "../../../signals/index.ts";
import { evaluate } from "./evaluate.ts";
import { type Call, ExpressionParser } from "./expression.ts";
import { Scope } from "./scope.ts";

/** A parsed handler: the method it calls, and the call as written. */
export interface Handler {
  /** The method of the component that is called, e.g. `"select"`. */
  readonly method: string;
  readonly call: Call;
}

/**
 * Parse `source`, or fail with an error naming `what` it is (e.g. "event
 * handler") and what is supported.
 */
export function parseHandler(source: string, what: string): EitherError<Handler> {
  const unsupported = (reason: string) =>
    Either.left(new Error(`Unsupported ${what} "${source}": ${reason}`));
  return ExpressionParser.parse(source)
    .match({
      left: (error) => unsupported(error.message),
      right: (expression) => {
        const shape = `write a call of a method, as in "method()" or "method($event)"`;
        if (expression.kind !== "call") {
          return unsupported(shape);
        }
        const { callee } = expression;
        if (callee.kind !== "property" || callee.receiver.kind !== "component") {
          return unsupported(shape);
        }
        return Either.right({ method: callee.name, call: expression });
      },
    });
}

/**
 * Run `handler` on `component` for `event`: the handler's `$event` is the
 * event, and the method is called with `component` as `this`.
 */
export function runHandler(handler: Handler, component: object, event: unknown): unknown {
  const lets = new Map<string, ReadonlySignal<unknown>>([["$event", signal(event)]]);
  return evaluate(handler.call, new Scope(component, lets));
}

/** Throw unless `target` has a method `method`. `describe` names the event for the message. */
export function requireMethod(target: object, method: string, describe: string): void {
  if (typeof (target as Record<string, unknown>)[method] !== "function") {
    throw new Error(`${target.constructor.name} has no method "${method}" for ${describe}`);
  }
}

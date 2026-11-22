// Handlers: what an event does. A handler is one call of a method of the
// component, or of a template variable (`#g="gauge"`, or an @let), with any
// arguments the template can express:
//
//   method()                     call the method
//   method($event)               call it with the event
//   g.show(3)                    call a method of the template variable g
//   select(item.id, $event.key)  arguments are ordinary expressions
//
// `$event` is the DOM event, or the value an output emits. Used by template
// event bindings `(name)="..."` and by host listeners `"(click)": "..."`.

import { signal, type ReadonlySignal } from "../../../signals/index.ts";
import { evaluate } from "./evaluate.ts";
import { type Call, ExpressionParser } from "./expression.ts";
import { Scope } from "./scope.ts";
import { match, Left, Right, type Either } from "@tinker/functional";

/** A parsed handler: the method it calls, and the call as written. */
export interface Handler {
  /** The method that is called, e.g. `"select"`. */
  readonly method: string;
  /**
   * The template variable the method belongs to (`g` in `g.show(3)`); undefined for the
   * component.
   */
  readonly target?: string;
  readonly call: Call;
}

/**
 * Parse `source`, or fail with an error naming `what` it is (e.g. "event
 * handler") and what is supported.
 */
export function parseHandler(source: string, what: string): Either<Handler, Error> {
  const unsupported = (reason: string) =>
    Left.of(new Error(`Unsupported ${what} "${source}": ${reason}`));
  return match(ExpressionParser.parse(source), {
    Left: (error) => unsupported(error.message),
    Right: (expression) => {
      const shape = `write a call of a method, as in "method()", "method($event)" or "g.method()"`;
      if (expression.kind !== "call") {
        return unsupported(shape);
      }
      const { callee } = expression;
      if (callee.kind !== "property") {
        return unsupported(shape);
      }
      if (callee.receiver.kind === "component") {
        return Right.of({ method: callee.name, call: expression });
      }
      const { receiver } = callee;
      if (receiver.kind === "property" && receiver.receiver.kind === "component") {
        return Right.of({ method: callee.name, target: receiver.name, call: expression });
      }
      return unsupported(shape);
    } });
}

/**
 * Run `handler` in `scope` for `event`: the handler's `$event` is the event, the
 * template variables of the scope are visible, and a method is called with its
 * object as `this`.
 */
export function runHandler(handler: Handler, scope: Scope, event: unknown): unknown {
  const lets = new Map<string, ReadonlySignal<unknown>>(scope.lets);
  lets.set("$event", signal(event));
  return evaluate(handler.call, new Scope(scope.component, lets));
}

/** Throw unless `target` has a method `method`. `describe` names the event for the message. */
export function requireMethod(target: object, method: string, describe: string): void {
  if (typeof (target as Record<string, unknown>)[method] !== "function") {
    throw new Error(`${target.constructor.name} has no method "${method}" for ${describe}`);
  }
}

// Evaluating a template expression against a component instance.
//
// Fields are read as plain properties; a call of a field (`count()`,
// `format()`) is a method call: the object the field was read from is `this`.
// Signals are functions, so reading one is just a call: run inside the
// view's watch, it makes the watch depend on that signal.

import type { Expression } from "./expression.ts";

/** The value of `expression`, with bare names read from `component`. */
export function evaluate(expression: Expression, component: object): unknown {
  switch (expression.kind) {
    case "component":
      return component;
    case "property":
      return read(evaluate(expression.receiver, component), expression.name);
    case "call": {
      const { callee } = expression;
      // A method keeps its receiver: evaluate it once, read the method from it.
      const receiver = callee.kind === "property" ? evaluate(callee.receiver, component) : undefined;
      const fn = callee.kind === "property" ? read(receiver, callee.name) : evaluate(callee, component);
      if (typeof fn !== "function") {
        throw new TypeError(`${print(callee)} is not a function`);
      }
      return fn.call(receiver);
    }
  }
}

function read(receiver: unknown, name: string): unknown {
  return (receiver as Record<string, unknown>)[name];
}

/** The expression as written (normalized), for error messages. */
export function print(expression: Expression): string {
  switch (expression.kind) {
    case "component":
      return "";
    case "property":
      return expression.receiver.kind === "component"
        ? expression.name
        : `${print(expression.receiver)}.${expression.name}`;
    case "call":
      return `${print(expression.callee)}()`;
  }
}

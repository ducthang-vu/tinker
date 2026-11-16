// Evaluating a template expression against a component instance.
//
// Fields are read as plain properties; a call of a field (`count()`,
// `format()`) is a method call: the object the field was read from is `this`.
// Signals are functions, so reading one is just a call: run inside the
// view's watch, it makes the watch depend on that signal.

import type { BinaryOperator, Expression } from "./expression.ts";
import type { Scope } from "./scope.ts";

/**
 * The value of `expression`: a bare name is a `@let` value if one is declared
 * with that name, else a field of the scope's component.
 */
export function evaluate(expression: Expression, scope: Scope): unknown {
  switch (expression.kind) {
    case "component":
      return scope.component;
    case "property":
      if (isLet(expression, scope)) {
        return scope.lets.get(expression.name);
      }
      return read(evaluate(expression.receiver, scope), expression.name);
    case "literal":
      return expression.value;
    case "binary":
      return operate(
        expression.operator,
        evaluate(expression.left, scope),
        evaluate(expression.right, scope),
      );
    case "call": {
      const { callee } = expression;
      if (callee.kind === "property" && isLet(callee, scope)) {
        // A `@let` holding a function is called without a receiver.
        return callFunction(scope.lets.get(callee.name), callee);
      }
      // A method keeps its receiver: evaluate it once, read the method from it.
      const receiver = callee.kind === "property" ? evaluate(callee.receiver, scope) : undefined;
      const fn = callee.kind === "property" ? read(receiver, callee.name) : evaluate(callee, scope);
      return callFunction(fn, callee, receiver);
    }
  }
}

/** A bare name (its receiver is the component) that a `@let` declares. */
function isLet(
  expression: Extract<Expression, { kind: "property" }>,
  scope: Scope,
): boolean {
  return expression.receiver.kind === "component" && scope.lets.has(expression.name);
}

function callFunction(fn: unknown, callee: Expression, receiver?: unknown): unknown {
  if (typeof fn !== "function") {
    throw new TypeError(`${print(callee)} is not a function`);
  }
  return fn.call(receiver);
}

/**
 * Apply a binary operator. The operands are whatever the template read, so
 * `+` and the others follow JavaScript's rules for them, as in a template
 * written in plain JavaScript.
 */
function operate(operator: BinaryOperator, left: unknown, right: unknown): unknown {
  switch (operator) {
    case "+":
      return (left as number) + (right as number);
    case "-":
      return (left as number) - (right as number);
    case "*":
      return (left as number) * (right as number);
    case "/":
      return (left as number) / (right as number);
    case "**":
      return (left as number) ** (right as number);
    case "===":
      return left === right;
      // Loose equality, as JavaScript defines it: it converts the operands first.

    case "==":
      return left == right;
  }
}

function read(receiver: unknown, name: string): unknown {
  return (receiver as Record<string, unknown>)[name];
}

/** The expression as written (normalized), for error messages. */
export function print(expression: Expression): string {
  switch (expression.kind) {
    case "literal":
      return typeof expression.value === "string"
        ? JSON.stringify(expression.value)
        : String(expression.value);
    case "binary":
      return `${print(expression.left)} ${expression.operator} ${print(expression.right)}`;
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

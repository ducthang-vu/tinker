// Evaluating a template expression against a component instance.
//
// Fields are read as plain properties; a call of a field (`count()`,
// `format()`) is a method call: the object the field was read from is `this`.
// Signals are functions, so reading one is just a call: run inside the
// view's watch, it makes the watch depend on that signal.

import type { BinaryOperator, Expression } from "./expression.ts";
import type { ReadonlySignal } from "../../../signals/index.ts";
import type { Scope } from "./scope.ts";
import { templateFunctionOf } from "./template-functions.ts";
import type { TemplateFunctionContract } from "../authoring/template-function.ts";
import { match } from "@tinker/functional";

/**
 * The value of `expression`: a bare name is a `@let` value if one is declared
 * with that name, else a field of the scope's component.
 */
export function evaluate(expression: Expression, scope: Scope): unknown {
  switch (expression.kind) {
    case "component":
      return scope.component;
    case "property": {
      const declared = letOf(expression, scope);
      if (declared) {
        return declared();
      }
      if (expression.receiver.kind === "component" && scope.checks !== undefined
        && !(expression.name in scope.component)) {
        scope.checks.warn(`The template reads "${expression.name}", which ${scope.component.constructor.name} does not have`);
      }
      const receiver = evaluate(expression.receiver, scope);
      return expression.optional && receiver == null ? undefined : read(receiver, expression.name);
    }
    case "object":
      return Object.fromEntries(expression.fields.map(({ key, value }) =>
        [key, evaluate(value, scope)]));
    case "array":
      return expression.items.map((item) => evaluate(item, scope));
    case "literal":
      return expression.value;
    case "not":
      return !evaluate(expression.operand, scope);
    case "negate":
      return -Number(evaluate(expression.operand, scope));
    case "conditional":
      return evaluate(expression.test, scope)
        ? evaluate(expression.then, scope)
        : evaluate(expression.otherwise, scope);
    case "binary":
      return binary(expression, scope);
    case "call": {
      const { callee } = expression;
      const args = expression.args.map((arg) => evaluate(arg, scope));
      const imported = importedFunction(callee, scope);
      if (imported) {
        return imported.call(...args);
      }
      const declared = callee.kind === "property" ? letOf(callee, scope) : undefined;
      if (declared) {
        // A `@let` holding a function is called without a receiver.
        return callFunction(declared(), callee, args);
      }
      // A method keeps its receiver: evaluate it once, read the method from it.
      const receiver = callee.kind === "property" ? evaluate(callee.receiver, scope) : undefined;
      if (callee.kind === "property" && callee.optional && receiver == null) {
        return undefined;
      }
      const fn = callee.kind === "property" ? read(receiver, callee.name) : evaluate(callee, scope);
      return callFunction(fn, callee, args, receiver);
    }
  }
}

/**
 * The computed signal of the `@let` a bare name refers to, if one is declared
 * with that name. A name with a receiver is a field, never a `@let`.
 */
function letOf(
  expression: Extract<Expression, { kind: "property" }>,
  scope: Scope,
): ReadonlySignal<unknown> | undefined {
  return expression.receiver.kind === "component" ? scope.lets.get(expression.name) : undefined;
}

/**
 * The template function a bare call such as `format(x)` names, when the component has no member
 * of that name: a member wins over an imported function.
 */
function importedFunction(callee: Expression, scope: Scope): TemplateFunctionContract | undefined {
  if (callee.kind !== "property" || callee.receiver.kind !== "component"
    || callee.name in scope.component) {
    return undefined;
  }
  return match(templateFunctionOf(scope.component, callee.name), {
    Some: (fn) => fn,
    None: () => undefined,
  });
}

function callFunction(
  fn: unknown,
  callee: Expression,
  args: unknown[],
  receiver?: unknown,
): unknown {
  if (typeof fn !== "function") {
    throw new TypeError(`${print(callee)} is not a function`);
  }
  return fn.apply(receiver, args);
}

/**
 * `&&` and `||` evaluate the right operand only when the left one does not
 * decide the result, as in JavaScript. The other operators evaluate both.
 */
function binary(expression: Extract<Expression, { kind: "binary" }>, scope: Scope): unknown {
  const left = evaluate(expression.left, scope);
  if (expression.operator === "??") {
    return left == null ? evaluate(expression.right, scope) : left;
  }
  if (expression.operator === "&&") {
    return left ? evaluate(expression.right, scope) : left;
  }
  if (expression.operator === "||") {
    return left ? left : evaluate(expression.right, scope);
  }
  return operate(expression.operator, left, evaluate(expression.right, scope));
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
    case "!==":
      return left !== right;

    case "!=":
      return left != right;
    case "<":
      return (left as number) < (right as number);
    case ">":
      return (left as number) > (right as number);
    case "<=":
      return (left as number) <= (right as number);
    case ">=":
      return (left as number) >= (right as number);
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
    case "not":
      return `!${print(expression.operand)}`;
    case "negate":
      return `-(${print(expression.operand)})`;
    case "conditional":
      return `${print(expression.test)} ? ${print(expression.then)} : ${print(expression.otherwise)}`;
    case "object":
      return `{ ${expression.fields.map(({ key, value }) => `${key}: ${print(value)}`)
        .join(", ")} }`;
    case "array":
      return `[${expression.items.map((item) => print(item))
        .join(", ")}]`;
    case "component":
      return "";
    case "property":
      return expression.receiver.kind === "component"
        ? expression.name
        : `${print(expression.receiver)}${expression.optional ? "?." : "."}${expression.name}`;
    case "call":
      return `${print(expression.callee)}(${expression.args.map((arg) => print(arg))
        .join(", ")})`;
  }
}

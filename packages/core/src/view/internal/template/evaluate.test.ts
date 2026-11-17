import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { evaluate, print } from "./evaluate.ts";
import { ExpressionParser } from "./expression.ts";
import { Scope } from "./scope.ts";

const run = (source: string, component: object) =>
  evaluate(ExpressionParser.parse(source)
    .getOrThrow(), new Scope(component));

describe("evaluate", () => {
  test("reads fields of the component, and fields of fields", () => {
    expect(run("title", { title: "Tinker" }))
      .toBe("Tinker");
    expect(run("items.length", { items: [1, 2] }))
      .toBe(2);
    expect(run("missing", {}))
      .toBeUndefined();
  });

  test("reads signals by calling them", () => {
    expect(run("count()", { count: signal(3) }))
      .toBe(3);
    expect(run("user().name", { user: signal({ name: "Ada" }) }))
      .toBe("Ada");
  });

  test("calls methods with their receiver as this", () => {
    class Greeter {
      name = "Ada";
      greet() {
        return `Hi ${this.name}`;
      }

      self() {
        return this;
      }
    }
    const greeter = new Greeter();
    expect(run("greet()", greeter))
      .toBe("Hi Ada");
    expect(run("self().greet()", greeter))
      .toBe("Hi Ada");
  });

  test("a call of a call has no receiver", () => {
    const component = {
      make: () =>
        function (this: unknown) {
          return this;
        },
    };
    expect(run("make()()", component))
      .toBeUndefined();
  });

  test("throws when calling something that is not a function", () => {
    expect(() => run("title()", { title: "x" }))
      .toThrow(new TypeError("title is not a function"));
    expect(() => run("user().name()", { user: () => ({ name: "x" }) }))
      .toThrow("user().name is not a function");
    expect(() => run("make()()", { make: () => 1 }))
      .toThrow("make() is not a function");
  });

  test("reading a field of nothing throws the usual TypeError", () => {
    expect(() => run("user().name", { user: () => undefined }))
      .toThrow(TypeError);
  });
});

test("print writes an expression back", () => {
  for (const source of ["title", "count()", "user().name", "a.b()()"]) {
    expect(print(ExpressionParser.parse(source)
      .getOrThrow()))
      .toBe(source);
  }
  expect(print({ kind: "component" }))
    .toBe("");
  expect(print(ExpressionParser.parse("count() * 2 + 1")
    .getOrThrow()))
    .toBe("count() * 2 + 1");
  expect(print(ExpressionParser.parse("!done")
    .getOrThrow()))
    .toBe("!done");
  expect(print(ExpressionParser.parse("\"loading\"")
    .getOrThrow()))
    .toBe("\"loading\"");
  expect(print(ExpressionParser.parse("true")
    .getOrThrow()))
    .toBe("true");
});

describe("operators", () => {
  test("arithmetic follows JavaScript's precedence and grouping", () => {
    expect(run("1 + 2 * 3", {}))
      .toBe(7);
    expect(run("(1 + 2) * 3", {}))
      .toBe(9);
    expect(run("10 - 4 - 3", {}))
      .toBe(3);
    expect(run("10 / 4", {}))
      .toBe(2.5);
    expect(run("2 ** 3 ** 2", {}))
      .toBe(512);
    expect(run("2 ** 3 * 2", {}))
      .toBe(16);
  });

  test("the equality operators compare; == converts its operands first", () => {
    expect(run("1 + 1 === 2", {}))
      .toBe(true);
    expect(run("1 === 2", {}))
      .toBe(false);
    expect(run("2 == 2", {}))
      .toBe(true);
    expect(run("1 == 2", {}))
      .toBe(false);
  });

  test("operators work on the component's fields and calls", () => {
    const component = { count: () => 3, total: 0 };
    expect(run("count() * 2 + 1", component))
      .toBe(7);
    expect(run("total === 0", component))
      .toBe(true);
  });
});

describe("literals", () => {
  test("strings, booleans, null and undefined evaluate to their values", () => {
    expect(run("\"loading\"", {}))
      .toBe("loading");
    expect(run("true", {}))
      .toBe(true);
    expect(run("false", {}))
      .toBe(false);
    expect(run("null", {}))
      .toBe(null);
    expect(run("undefined", {}))
      .toBe(undefined);
  });

  test("a literal compares with a field", () => {
    expect(run("status === \"loading\"", { status: "loading" }))
      .toBe(true);
    expect(run("status === \"loading\"", { status: "done" }))
      .toBe(false);
  });
});

describe("comparisons and logical operators", () => {
  test("comparisons bind looser than arithmetic, and tighter than equality", () => {
    expect(run("1 + 2 < 4", {}))
      .toBe(true);
    expect(run("2 * 3 >= 6", {}))
      .toBe(true);
    expect(run("1 < 2 === true", {}))
      .toBe(true);
    expect(run("3 > 2 > 1", {}))
      .toBe(false);
    expect(run("2 <= 2", {}))
      .toBe(true);
    expect(run("2 >= 3", {}))
      .toBe(false);
  });

  test("!== and != are the negations of === and ==", () => {
    expect(run("1 !== 2", {}))
      .toBe(true);
    expect(run("1 != 1", {}))
      .toBe(false);
    expect(run("1 != '1'", {}))
      .toBe(false);
  });

  test("! binds tighter than comparisons, as in JavaScript", () => {
    expect(run("!done === false", { done: true }))
      .toBe(true);
    expect(run("!(1 + 1 === 2)", {}))
      .toBe(false);
  });

  test("&& binds tighter than ||", () => {
    expect(run("false || true && false", {}))
      .toBe(false);
    expect(run("true || false && false", {}))
      .toBe(true);
  });

  test("&& and || return an operand, and evaluate the right one only when needed", () => {
    let calls = 0;
    const scope = { check: () => {
      calls += 1;
      return "checked";
    }, name: "Ana" };
    expect(run("name && check()", scope))
      .toBe("checked");
    expect(calls)
      .toBe(1);
    expect(run("name || check()", scope))
      .toBe("Ana");
    expect(calls)
      .toBe(1);
    expect(run("0 && check()", scope))
      .toBe(0);
    expect(calls)
      .toBe(1);
  });
});

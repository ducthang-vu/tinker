import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { evaluate, print } from "./evaluate.ts";
import { ExpressionParser } from "./expression.ts";
import { Scope } from "./scope.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional/v1";

const run = (source: string, component: object) =>
  evaluate(valueOrThrow(ExpressionParser.parse(source)), new Scope(component));

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
    expect(print(valueOrThrow(ExpressionParser.parse(source))))
      .toBe(source);
  }
  expect(print({ kind: "component" }))
    .toBe("");
  expect(print(valueOrThrow(ExpressionParser.parse("count() * 2 + 1"))))
    .toBe("count() * 2 + 1");
  expect(print(valueOrThrow(ExpressionParser.parse("!done"))))
    .toBe("!done");
  expect(print(valueOrThrow(ExpressionParser.parse("\"loading\""))))
    .toBe("\"loading\"");
  expect(print(valueOrThrow(ExpressionParser.parse("true"))))
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

describe("the conditional operator", () => {
  test("picks the then or the otherwise value by the test", () => {
    const component = { on: true, count: 3 };
    expect(run("on ? 'yes' : 'no'", component))
      .toBe("yes");
    expect(run("count > 5 ? 'big' : 'small'", component))
      .toBe("small");
  });

  test("nests to the right, and parentheses group it", () => {
    const grade = (score: number) => run(
      "score >= 90 ? 'A' : score >= 60 ? 'B' : 'C'",
      { score },
    );
    expect([grade(95), grade(70), grade(10)])
      .toEqual(["A", "B", "C"]);
    expect(run("(on ? 'a' : 'b') === 'a'", { on: false }))
      .toBe(false);
  });

  test("only the chosen branch is evaluated", () => {
    expect(run("missing ? 1 : 2", {}))
      .toBe(2);
  });

  test("print writes it back", () => {
    expect(print(valueOrThrow(ExpressionParser.parse("a ? b : c"))))
      .toBe("a ? b : c");
  });
});

describe("safe navigation, defaults, and literals", () => {
  test("?. reads through a null or undefined receiver as undefined", () => {
    expect(run("user?.name", { user: null }))
      .toBeUndefined();
    expect(run("user?.name", { user: { name: "Ana" } }))
      .toBe("Ana");
    expect(run("user?.greet()", { user: null }))
      .toBeUndefined();
  });

  test("a link after ?. is not optional, as in JavaScript", () => {
    expect(() => run("user?.address.city", { user: { address: undefined } }))
      .toThrow(TypeError);
    expect(run("user?.address?.city", { user: { address: undefined } }))
      .toBeUndefined();
  });

  test("?? gives the right side only for null and undefined", () => {
    expect(run("name ?? 'guest'", { name: null }))
      .toBe("guest");
    expect(run("name ?? 'guest'", { name: "" }))
      .toBe("");
    expect(run("count ?? 7", { count: 0 }))
      .toBe(0);
  });

  test("an object literal builds an object, with a shorthand key reading the field", () => {
    expect(run("{ done: todo.done, title, 'big': n > 1 }", { todo: { done: true }, title: "x", n: 2 }))
      .toEqual({ done: true, title: "x", big: true });
  });

  test("an array literal builds an array", () => {
    expect(run("[a, b + 1]", { a: 1, b: 2 }))
      .toEqual([1, 3]);
    expect(run("[]", {}))
      .toEqual([]);
  });

  test("print writes the new forms back", () => {
    expect(print(valueOrThrow(ExpressionParser.parse("a?.b ?? { k: c }"))))
      .toBe("a?.b ?? { k: c }");
  });
});

test("print writes an array literal back", () => {
  expect(print(valueOrThrow(ExpressionParser.parse("[a, 1]"))))
    .toBe("[a, 1]");
});

test("print writes call arguments back", () => {
  expect(print(valueOrThrow(ExpressionParser.parse("pick(item.id, $event.key)"))))
    .toBe("pick(item.id, $event.key)");
});

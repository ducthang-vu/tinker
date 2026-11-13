import { describe, expect, test } from "vitest";
import { signal } from "../../signals/index.ts";
import { evaluate, print } from "./evaluate.ts";
import { ExpressionParser } from "./expression.ts";

const run = (source: string, component: object) =>
  evaluate(ExpressionParser.parse(source)
    .getOrThrow(), component);

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
});

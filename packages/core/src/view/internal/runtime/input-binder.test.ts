import { describe, expect, test, vi } from "vitest";
import { signal } from "../../../signals/index.ts";
import { input, inputsNamed } from "../authoring/input.ts";
import { ExpressionParser } from "../template/expression.ts";
import { InputBinder } from "./input-binder.ts";
import { Scope } from "../template/scope.ts";
import { match, Left, Right, valueOrThrow } from "@tinker/functional";

const parse = (source: string) => valueOrThrow(ExpressionParser.parse(source));

describe("InputBinder", () => {
  test("sets its inputs to the expression's value, only when it changed", () => {
    class Card {
      readonly title = input<string>();
    }
    const card = new Card();
    const [title] = inputsNamed([card], "title");
    const bind = vi.spyOn(title!, "bind");
    const name = signal("a");
    const binder = new InputBinder([title!], parse("name()"), new Scope({ name }));

    binder.update();
    binder.update();
    name.set("b");
    binder.update();

    expect(card.title())
      .toBe("b");
    expect(bind.mock.calls)
      .toEqual([["a"], ["b"]]);
  });

  test("passes any value through as is, undefined included", () => {
    class Card {
      readonly data = input<unknown>("default");
    }
    const card = new Card();
    new InputBinder(inputsNamed([card], "data"), parse("missing"), new Scope({}))
      .update();
    expect(card.data())
      .toBeUndefined();
  });
});

describe("inputsNamed", () => {
  test("finds the inputs of that name on several instances, case-insensitively", () => {
    class A {
      readonly maxWidth = input(0);
    }
    class B {
      readonly maxwidth = input(0);
      readonly other = input(0);
    }
    class C {}
    expect(inputsNamed([new A(), new B(), new C()], "MAXWIDTH"))
      .toHaveLength(2);
    expect(inputsNamed([new C()], "maxwidth"))
      .toEqual([]);
  });
});

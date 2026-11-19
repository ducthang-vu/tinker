import { expect, test } from "vitest";
import { AdaptArgument } from "./adapt-argument.ts";

/** The context TypeScript passes to a method decorator; the decorator does not read it. */
const context = { kind: "method", name: "method" } as ClassMethodDecoratorContext;

test("the method receives the adapted argument, and the others unchanged", () => {
  const seen: unknown[][] = [];
  const method = (url: string, extra: number) => {
    seen.push([url, extra]);
    return url;
  };
  const adapt = (value: string[]) => value.join("/");
  const adapted = AdaptArgument(0, adapt)(method, context);
  expect(adapted(["todos", "7"] as never, 1))
    .toBe("todos/7");
  expect(seen)
    .toEqual([["todos/7", 1]]);
});

test("the method is called with its this", () => {
  const method = function (this: { name: string }, value: string) {
    return `${this.name}:${value}`;
  };
  const owned = { kind: "method", name: "method" } as ClassMethodDecoratorContext<{ name: string }>;
  const adapted = AdaptArgument(0, (value: number) => String(value))(method, owned);
  expect(adapted.call({ name: "owner" }, 7 as never))
    .toBe("owner:7");
});

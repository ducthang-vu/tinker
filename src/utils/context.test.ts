import { describe, expect, test } from "vitest";
import { Context } from "./context.ts";

describe("Context", () => {
  test("starts with its initial value", () => {
    expect(new Context<string | null>(null)
      .get())
      .toBe(null);
    expect(new Context("default")
      .get())
      .toBe("default");
  });

  test("set changes the value and returns the previous one", () => {
    const context = new Context("a");
    expect(context.set("b"))
      .toBe("a");
    expect(context.get())
      .toBe("b");
  });

  test("run sets the value for the call, returns the result, and restores", () => {
    const context = new Context("outside");
    const result = context.run("inside", () => {
      expect(context.get())
        .toBe("inside");
      return 42;
    });
    expect(result)
      .toBe(42);
    expect(context.get())
      .toBe("outside");
  });

  test("nested runs restore exactly what was there before each of them", () => {
    const context = new Context(0);
    const seen: number[] = [];
    context.run(1, () => {
      seen.push(context.get());
      context.run(2, () => seen.push(context.get()));
      seen.push(context.get());
    });
    seen.push(context.get());
    expect(seen)
      .toEqual([1, 2, 1, 0]);
  });

  test("run restores the previous value even when fn throws", () => {
    const context = new Context("outside");
    expect(() =>
      context.run("inside", () => {
        throw new Error("boom");
      }),
    )
      .toThrow("boom");
    expect(context.get())
      .toBe("outside");
  });

  test("run restores the value from before it, even if fn called set", () => {
    const context = new Context("outside");
    context.run("inside", () => context.set("changed inside"));
    expect(context.get())
      .toBe("outside");
  });

  test("separate contexts are independent", () => {
    const a = new Context("a");
    const b = new Context("b");
    a.run("a2", () => expect(b.get())
      .toBe("b"));
  });
});

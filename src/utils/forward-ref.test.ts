import { describe, expect, expectTypeOf, test } from "vitest";
import { ForwardRef, type MaybeForwardRef, resolveForwardRef } from "./forward-ref.ts";

describe("ForwardRef", () => {
  test("refers to a class declared later, resolved once it exists", () => {
    // Without a forward reference, `[Later]` here would throw: Later is not defined yet.
    const references: MaybeForwardRef<typeof Later>[] = [ForwardRef.of(() => Later)];
    class Later {}

    expect(resolveForwardRef(references[0]!)).toBe(Later);
  });

  test("is its own type, not disguised as the value", () => {
    class Target {}
    const reference = ForwardRef.of(() => Target);
    expectTypeOf(reference).toEqualTypeOf<ForwardRef<typeof Target>>();
    expectTypeOf(reference.resolve()).toEqualTypeOf<typeof Target>();
    // @ts-expect-error a ForwardRef must be resolved before it is used as the class
    const notResolved: typeof Target = reference;
    void notResolved;
  });

  test("resolve reads the value every time, so it follows the latest one", () => {
    let current = "first";
    const reference = ForwardRef.of(() => current);
    expect(reference.resolve()).toBe("first");
    current = "second";
    expect(reference.resolve()).toBe("second");
  });

  test("resolveForwardRef returns any other value unchanged, including functions and classes", () => {
    class Plain {}
    const fn = () => "not a forward ref";
    const object = { a: 1 };
    expect(resolveForwardRef(Plain)).toBe(Plain);
    expect(resolveForwardRef(fn)).toBe(fn);
    expect(resolveForwardRef(object)).toBe(object);
    expect(resolveForwardRef(42)).toBe(42);
    expect(resolveForwardRef(null)).toBe(null);
  });

  test("resolveForwardRef is typed by the referenced value", () => {
    class Target {}
    const value: MaybeForwardRef<typeof Target> = ForwardRef.of(() => Target);
    expectTypeOf(resolveForwardRef(value)).toEqualTypeOf<typeof Target>();
  });

  test("can only be created with the static factory", () => {
    // @ts-expect-error the constructor is private
    const direct = new ForwardRef(() => 1);
    void direct;
    expect(ForwardRef.of(() => 1)).toBeInstanceOf(ForwardRef);
  });
});

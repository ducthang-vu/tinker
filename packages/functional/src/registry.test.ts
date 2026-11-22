import { describe, expect, test } from "vitest";
import { flatMap, map } from "./functor.ts";
import { implementFlatMap, implementMap } from "./registry.ts";
import { MATCHABLE, type Matchable } from "./monad.ts";

/** A box of a named case. Each test uses its own case name, since registration is global. */
const boxOf = (name: string, ...args: unknown[]): Matchable => ({ [MATCHABLE]: { name, args } });

describe("implementMap and implementFlatMap", () => {
  test("map uses the implementation registered for a new case", () => {
    implementMap("RegistryDouble", (box, f) => boxOf("RegistryDouble", f(box[MATCHABLE].args[0])));
    const result = map(boxOf("RegistryDouble", 2), (n: number) => n * 10);
    expect(result[MATCHABLE])
      .toEqual({ name: "RegistryDouble", args: [20] });
  });

  test("flatMap uses the implementation registered for a new case", () => {
    implementFlatMap("RegistryChain", (box, f) => f(box[MATCHABLE].args[0]));
    const result = flatMap(boxOf("RegistryChain", 3), (n: number) => boxOf("Result", n + 1));
    expect(result[MATCHABLE])
      .toEqual({ name: "Result", args: [4] });
  });

  test("the data-last map applies the registered implementation", () => {
    implementMap("RegistryLast", (box, f) => boxOf("RegistryLast", f(box[MATCHABLE].args[0])));
    const addOne = map((n: number) => n + 1);
    expect(addOne(boxOf("RegistryLast", 1))[MATCHABLE])
      .toEqual({ name: "RegistryLast", args: [2] });
  });

  test("a case can be registered only once", () => {
    implementMap("RegistryOnce", (box) => box);
    expect(() => implementMap("RegistryOnce", (box) => box))
      .toThrow("map is already implemented for the case RegistryOnce");
    implementFlatMap("RegistryOnceChain", (box) => box);
    expect(() => implementFlatMap("RegistryOnceChain", (box) => box))
      .toThrow("flatMap is already implemented for the case RegistryOnceChain");
  });

  test("the built-in cases cannot be registered again", () => {
    expect(() => implementMap("Right", (box) => box))
      .toThrow("already implemented for the case Right");
    expect(() => implementFlatMap("Some", (box) => box))
      .toThrow("already implemented for the case Some");
  });

  test("map of a case that was never registered throws and names the registration", () => {
    expect(() => map(boxOf("RegistryUnknown"), (value: unknown) => value))
      .toThrow("map is not implemented for the case RegistryUnknown: call implementMap");
  });

  test("flatMap of a case that was never registered throws and names the registration", () => {
    expect(() => flatMap(boxOf("RegistryUnknownChain"), (value: unknown) => boxOf("X", value)))
      .toThrow("flatMap is not implemented for the case RegistryUnknownChain: call implementFlatMap");
  });
});

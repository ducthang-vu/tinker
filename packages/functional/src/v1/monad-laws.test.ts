import { describe, expect, test } from "vitest";
import { monadLaws, type MonadUnderTest } from "./monad-laws.ts";

/** A lawful monad of numbers, boxed as { value } or { none }. */
type Box = { readonly value: number } | { readonly none: true };
const some = (value: number): Box => ({ value });
const nothing: Box = { none: true };
const lawful: MonadUnderTest<Box, number> = {
  name: "Box",
  samples: [some(1), some(2), nothing],
  values: [1, 2],
  of: some,
  map: (box, f) => ("value" in box ? some(f(box.value)) : box),
  flatMap: (box, f) => ("value" in box ? f(box.value) : box),
  equal: (a, b) => ("value" in a && "value" in b ? a.value === b.value : "none" in a && "none" in b),
  f: (value) => value + 1,
  g: (value) => value * 2,
  step: (value) => some(value + 10),
  nextStep: (value) => (value > 5 ? nothing : some(value * 3)),
};

/** Runs every check, so a failure shows the description. */
const runAll = (monad: MonadUnderTest<Box, number>) =>
  monadLaws(monad)
    .map(([description, check]) => [description, (): void => check()] as const);

describe("monadLaws", () => {
  test("returns one named check per law", () => {
    const checks = monadLaws(lawful);
    expect(checks)
      .toHaveLength(6);
    expect(checks[0]![0])
      .toContain("Box: map with the identity");
  });

  test("a lawful monad passes every check", () => {
    for (const [, check] of runAll(lawful)) {
      expect(check)
        .not.toThrow();
    }
  });

  test("a map that changes boxes fails the identity law", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, map: (box) => ("value" in box ? some(0) : box) };
    const identity = runAll(broken)[0]!;
    expect(identity[1])
      .toThrow("map(box, identity) changed a box");
  });

  test("a flatMap that ignores its step fails the left identity law", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, flatMap: (box) => box };
    const leftIdentity = runAll(broken)[2]!;
    expect(leftIdentity[1])
      .toThrow("flatMap left identity fails");
  });

  test("an equality that is always false fails reflexivity", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, equal: () => false };
    const reflexive = runAll(broken)[5]!;
    expect(reflexive[1])
      .toThrow("not equal to itself");
  });
});

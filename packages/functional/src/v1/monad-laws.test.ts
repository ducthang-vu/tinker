import { describe, expect, test } from "vitest";
import { type LawCheck, monadLaws, type MonadUnderTest } from "./monad-laws.ts";

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
  cases: ["Some", "None"],
  successCase: "Some",
  caseOf: (box) => ("value" in box ? "Some" : "None"),
  f: (value) => value + 1,
  g: (value) => value * 2,
  step: (value) => some(value + 10),
  nextStep: (value) => (value > 5 ? nothing : some(value * 3)),
};

/** Runs every check, so a failure shows the description. */
const runAll = (monad: MonadUnderTest<Box, number>): LawCheck[] =>
  monadLaws(monad)
    .map(([description, check]) => [description, (): void => check()] as const);

/** The check whose description contains `text`. */
const find = (checks: readonly LawCheck[], text: string): LawCheck => {
  const found = checks.find(([description]) => description.includes(text));
  if (!found) {
    throw new Error(`no check mentions ${text}`);
  }
  return found;
};

describe("monadLaws", () => {
  test("returns one named check per law and per match interaction", () => {
    const checks = monadLaws(lawful);
    expect(checks)
      .toHaveLength(9);
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
    expect(find(runAll(broken), "map with the identity")[1])
      .toThrow("map(box, identity) changed a box");
  });

  test("a flatMap that ignores its step fails the left identity law", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, flatMap: (box) => box };
    expect(find(runAll(broken), "left identity")[1])
      .toThrow("flatMap left identity fails");
  });

  test("a caseOf that names a case outside the monad fails the match check", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, caseOf: () => "Other" };
    expect(find(runAll(broken), "every box is in one of")[1])
      .toThrow("not one of Some, None");
  });

  test("an of that builds a box outside the success case fails the match check", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, successCase: "None" };
    expect(find(runAll(broken), "of(a) is in the success case")[1])
      .toThrow("is not in the None case");
  });

  test("a map that turns a success into a failure fails the case check", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, map: () => nothing };
    expect(find(runAll(broken), "map keeps the case")[1])
      .toThrow("map changed the case of a box");
  });

  test("a flatMap that changes the case of a box fails the case check", () => {
    const broken: MonadUnderTest<Box, number> = { ...lawful, flatMap: () => nothing };
    expect(find(runAll(broken), "flatMap(box, of) keeps the case")[1])
      .toThrow("flatMap(box, of) changed the case of a box");
  });
});

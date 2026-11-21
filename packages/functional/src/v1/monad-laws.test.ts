import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { EDGE_VALUES } from "./edge-values.ts";
import { type LawCheck, monadLaws, type MonadUnderTest } from "./monad-laws.ts";

/** A box holding any value, or nothing. Tags, not `in`, so undefined and null count as values. */
type Box = { readonly tag: "Some"; readonly value: unknown } | { readonly tag: "None" };
const some = (value: unknown): Box => ({ tag: "Some", value });
const nothing: Box = { tag: "None" };

/** Normal values and edge cases: every interaction is checked on each of them. */

/** Each value boxed as a success, plus nothing: the samples the checks run on. */
const samples: readonly Box[] = [...EDGE_VALUES.map(some), nothing];

/** The lawful test monad. Equality is structural: NaN equals NaN, objects compare by content. */
const lawful: MonadUnderTest<Box, unknown> = {
  name: "Box",
  samples,
  values: EDGE_VALUES,
  of: some,
  map: (box, f) => (box.tag === "Some" ? some(f(box.value)) : box),
  flatMap: (box, f) => (box.tag === "Some" ? f(box.value) : box),
  equal: (a, b) => isDeepStrictEqual(a, b),
  cases: ["Some", "None"],
  successCase: "Some",
  caseOf: (box) => box.tag,
  f: (value) => [value],
  g: (value) => ({ wrapped: value }),
  step: (value) => some(value),
  nextStep: (value) => (value === null || value === undefined ? nothing : some([value])),
};

/** Runs every check, so a failure shows the description. */
const runAll = (monad: MonadUnderTest<Box, unknown>): LawCheck[] =>
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

  test("a lawful monad passes every check on every edge value", () => {
    for (const [description, check] of runAll(lawful)) {
      expect(check, description)
        .not.toThrow();
    }
  });

  test("the samples cover every edge value and a nothing", () => {
    expect(samples)
      .toHaveLength(EDGE_VALUES.length + 1);
    expect(samples.at(-1))
      .toEqual(nothing);
  });

  // Each interaction is broken for one edge value at a time, so every value must be exercised.
  // A check that never sees the value would pass, and the test would fail.
  const brokenFor = (value: unknown) => (box: Box) =>
    box.tag === "Some" && isDeepStrictEqual(box.value, value);

  test.each(EDGE_VALUES.map((value) => [String(value), value] as const))(
    "map is checked on the value %s",
    (_, value) => {
      const broken: MonadUnderTest<Box, unknown> = {
        ...lawful,
        map: (box, f) => (brokenFor(value)(box) ? nothing : lawful.map(box, f)),
      };
      expect(find(runAll(broken), "map with the identity")[1])
        .toThrow("map(box, identity) changed a box");
    },
  );

  test.each(EDGE_VALUES.map((value) => [String(value), value] as const))(
    "flatMap left identity is checked on the value %s",
    (_, value) => {
      const broken: MonadUnderTest<Box, unknown> = {
        ...lawful,
        flatMap: (box, f) => (brokenFor(value)(box) ? nothing : lawful.flatMap(box, f)),
      };
      expect(find(runAll(broken), "left identity")[1])
        .toThrow("flatMap left identity fails");
    },
  );

  test.each(EDGE_VALUES.map((value) => [String(value), value] as const))(
    "match is checked on the value %s",
    (_, value) => {
      const broken: MonadUnderTest<Box, unknown> = {
        ...lawful,
        caseOf: (box) => (brokenFor(value)(box) ? "Other" : box.tag),
      };
      expect(find(runAll(broken), "every box is in one of")[1])
        .toThrow("not one of Some, None");
    },
  );

  test("a flatMap that changes the case of a box fails the case check", () => {
    const broken: MonadUnderTest<Box, unknown> = { ...lawful, flatMap: () => nothing };
    expect(find(runAll(broken), "flatMap(box, of) keeps the case")[1])
      .toThrow("flatMap(box, of) changed the case of a box");
  });

  test("a map that turns a success into a failure fails the case check", () => {
    const broken: MonadUnderTest<Box, unknown> = { ...lawful, map: () => nothing };
    expect(find(runAll(broken), "map keeps the case")[1])
      .toThrow("map changed the case of a box");
  });

  test("an of that builds a box outside the success case fails the match check", () => {
    const broken: MonadUnderTest<Box, unknown> = { ...lawful, successCase: "None" };
    expect(find(runAll(broken), "of(a) is in the success case")[1])
      .toThrow("is not in the None case");
  });
});

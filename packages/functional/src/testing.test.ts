import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { flatMap as maybeFlatMap, map as maybeMap } from "./lib/functor/functor.ts";
import { None, Some, type Maybe } from "./lib/monad/maybe.ts";
import { match } from "./lib/monad/monad.ts";
import {
  type ChainUnderTest,
  chainLaws,
  type FunctorUnderTest,
  functorLaws,
  type LawCheck,
  monadLaws,
  type MonadUnderTest,
  EDGE_VALUES,
} from "./testing.ts";

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

describe("monadLaws on the library's Maybe, with the default equality", () => {
  const maybe: MonadUnderTest<Maybe<unknown>, unknown> = {
    name: "Maybe",
    samples: [...EDGE_VALUES.map((value) => Some.of(value)), Some.of(Some.of(0)), None.of()],
    values: EDGE_VALUES,
    of: (value) => Some.of(value),
    map: (box, f) => maybeMap(box, f),
    flatMap: (box, f) => maybeFlatMap(box, f),
    cases: ["Some", "None"],
    successCase: "Some",
    caseOf: (box) => match(box, { Some: () => "Some", None: () => "None" }),
    // The default equality compares objects by reference, so these return their input unchanged.
    f: (value) => value,
    g: (value) => value,
    step: (value) => Some.of(value),
    nextStep: (value) => (value === null || value === undefined ? None.of() : Some.of(value)),
  };

  test("every law holds on every edge value, nested boxes included", () => {
    for (const [description, check] of monadLaws(maybe)) {
      expect(check, description)
        .not.toThrow();
    }
  });
});

describe("functorLaws", () => {
  /** A map-only functor: a tagged value, with no flatMap, so it is not a monad. */
  type Tagged = { readonly label: string; readonly value: unknown };
  const tagged = (value: unknown): Tagged => ({ label: "t", value });
  // Tagged holds plain objects, so its equality is structural: the author supplies it.
  const sameTag = (a: Tagged, b: Tagged): boolean =>
    a.label === b.label && isDeepStrictEqual(a.value, b.value);
  const taggedFunctor: FunctorUnderTest<Tagged, unknown> = {
    name: "Tagged",
    samples: EDGE_VALUES.map(tagged),
    map: (box, f) => ({ ...box, value: f(box.value) }),
    equal: sameTag,
    f: (value) => value,
    g: (value) => value,
  };

  test("returns the two functor laws", () => {
    const checks = functorLaws(taggedFunctor);
    expect(checks.map(([description]) => description))
      .toEqual([
        "Tagged: map with the identity leaves each box unchanged",
        "Tagged: map composes: map(map(box, f), g) is map(box, g after f)",
      ]);
  });

  test("a map-only functor passes every functor law on every edge value", () => {
    for (const [description, check] of functorLaws(taggedFunctor)) {
      expect(check, description)
        .not.toThrow();
    }
  });

  test("the library's Maybe passes the functor laws with no flatMap", () => {
    const maybeFunctor: FunctorUnderTest<Maybe<unknown>, unknown> = {
      name: "Maybe",
      samples: [...EDGE_VALUES.map((value) => Some.of(value)), None.of()],
      map: (box, f) => maybeMap(box, f),
      f: (value) => value,
      g: (value) => value,
    };
    for (const [description, check] of functorLaws(maybeFunctor)) {
      expect(check, description)
        .not.toThrow();
    }
  });

  test("a map that changes boxes fails the identity law", () => {
    const broken: FunctorUnderTest<Tagged, unknown> = {
      ...taggedFunctor,
      map: (box) => ({ ...box, value: null }),
    };
    expect(functorLaws(broken)[0]![1])
      .toThrow("map(box, identity) changed a box");
  });

  test("a map that applies f twice fails the composition law", () => {
    const broken: FunctorUnderTest<Tagged, unknown> = {
      ...taggedFunctor,
      map: (box, f) => ({ ...box, value: f(f(box.value)) }),
      f: (value) => [value],
      g: (value) => ({ wrapped: value }),
    };
    expect(functorLaws(broken)[1]![1])
      .toThrow("map does not compose");
  });
});

describe("chainLaws", () => {
  /** The identity chain: a box holding a value, with flatMap as application. Not matchable. */
  class Id {
    constructor(readonly value: unknown) {}
  }
  const id = (value: unknown): Id => new Id(value);
  const sameId = (a: Id, b: Id): boolean => isDeepStrictEqual(a.value, b.value);
  const lawfulChain: ChainUnderTest<Id, unknown> = {
    name: "Id",
    samples: EDGE_VALUES.map(id),
    values: EDGE_VALUES,
    of: id,
    flatMap: (box, f) => f(box.value),
    equal: sameId,
    step: (value) => id([value]),
    nextStep: (value) => (value === null || value === undefined ? id(null) : id(value)),
  };

  test("returns the three chain laws", () => {
    expect(chainLaws(lawfulChain)
      .map(([description]) => description))
      .toEqual([
        "Id: flatMap left identity: flatMap(of(a), step) is step(a)",
        "Id: flatMap right identity: flatMap(box, of) is box",
        "Id: flatMap associates: flatMap(flatMap(box, step), nextStep) is"
        + " flatMap(box, a => flatMap(step(a), nextStep))",
      ]);
  });

  test("a lawful chain passes every chain law on every edge value", () => {
    for (const [description, check] of chainLaws(lawfulChain)) {
      expect(check, description)
        .not.toThrow();
    }
  });

  test("a flatMap that ignores its step fails the left identity law", () => {
    const broken: ChainUnderTest<Id, unknown> = { ...lawfulChain, flatMap: (box) => box };
    expect(find(chainLaws(broken), "left identity")[1])
      .toThrow("flatMap left identity fails");
  });

  test("an of that wraps its value fails the right identity law", () => {
    const broken: ChainUnderTest<Id, unknown> = { ...lawfulChain, of: (value) => id([value]) };
    expect(find(chainLaws(broken), "right identity")[1])
      .toThrow("flatMap right identity fails");
  });

  test("without an equal, boxes compare by reference, so a fresh box is not equal", () => {
    const noEqual: ChainUnderTest<Id, unknown> = { ...lawfulChain, equal: undefined };
    expect(find(chainLaws(noEqual), "right identity")[1])
      .toThrow("flatMap right identity fails");
  });
});

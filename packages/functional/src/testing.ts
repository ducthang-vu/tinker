// The testing helpers for functors, chains, monads and optics, and the edge values they are run
// on. Import them as `@tinker/functional/testing`. Each checker returns its law checks as
// [description, check] pairs, so any test framework can run them: see `functorLaws`, `chainLaws`,
// `monadLaws`, `isoLaws`, `lensLaws` and `optionalLaws`.

import { isEqual, match } from "./lib/monad/monad.ts";
import { isSome, type Maybe } from "./lib/monad/maybe.ts";
import type { Iso, Lens, Optional } from "./lib/optics/optics.ts";

// Normal values and edge cases. Every interaction of a monad is tested on each one.
export const EDGE_VALUES: readonly unknown[] = [
  0, -0, 1, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
  "", " ", "text", "null", "0",
  true, false,
  null, undefined,
  [], [undefined], [null], [0], [[]], [1, 2, 3], [, 1],
  {}, { a: undefined }, { a: null }, { a: 1 }, { "": 0 },
  new Set(), new Set([0]), new Map(), new Map([["k", 1]]),
  new Date(0), 0n, Symbol("s"), Math.max,
];

/** A functor to check: its boxes, and its map. Map must obey the functor laws. */
export interface FunctorUnderTest<M, A> {
  /** The name shown in each description, e.g. "Maybe". */
  readonly name: string;
  /** Boxes to test the laws on. Include a success, a failure or none, and a nested box. */
  readonly samples: readonly M[];
  /** The functor's map, data-first. */
  readonly map: (box: M, f: (value: A) => A) => M;
  /** Whether two boxes are equal. Defaults to `isEqual`, which uses the EQUALS protocol. */
  readonly equal?: (a: M, b: M) => boolean;
  /** Two transforms for the map laws. */
  readonly f: (value: A) => A;
  /** The function applied to the value. */
  readonly g: (value: A) => A;
}

/** A chain to check: its boxes, its of, and its flatMap. FlatMap must obey the chain laws. */
export interface ChainUnderTest<M, A> {
  /** The name shown in each description, e.g. "Maybe". */
  readonly name: string;
  /** Boxes to test the laws on. Include a success, a failure or none, and a nested box. */
  readonly samples: readonly M[];
  /** Values to test the left identity on. */
  readonly values: readonly A[];
  /** Builds a box holding a value: the chain's `of`, e.g. `Some.of`. */
  readonly of: (value: A) => M;
  /** The chain's flatMap, data-first. */
  readonly flatMap: (box: M, f: (value: A) => M) => M;
  /** Whether two boxes are equal. Defaults to `isEqual`, which uses the EQUALS protocol. */
  readonly equal?: (a: M, b: M) => boolean;
  /** Two steps for the flatMap laws. */
  readonly step: (value: A) => M;
  /** The next step of the monad, from the value. */
  readonly nextStep: (value: A) => M;
}

/** A monad to check: a functor and a chain, whose match names each box's case. */
export interface MonadUnderTest<M, A> extends FunctorUnderTest<M, A>, ChainUnderTest<M, A> {
  /** The names of the monad's cases, e.g. ["Some", "None"]. */
  readonly cases: readonly string[];
  /** The case that `of` builds, e.g. "Some". */
  readonly successCase: string;
  /** The case a box is in, read through the monad's match, e.g. `match(box, { Some, None })`. */
  readonly caseOf: (box: M) => string;
}

/** A check: its description, and a function that throws when the law fails. */
export type LawCheck = readonly [description: string, check: () => void];

/**
 * Throws, with `message`, unless `holds` is true for every item: a pipeline, with no loop.
 *
 * @param items The items to check.
 * @param holds Tells whether the law holds for one item.
 * @param message The error message, when the law fails for some item.
 * @throws {Error} With `message`, when `holds` is false for some item.
 */
const holdsForAll = <X>(
  items: readonly X[],
  holds: (item: X) => boolean,
  message: string,
): void => {
  if (!items.every(holds)) {
    throw new Error(message);
  }
};

/**
 * The functor laws, as checks: `map` with the identity leaves each box unchanged, and `map`
 * composes. Use it for a type that has `map` but no `flatMap`. Each check is a
 * `[description, check]` pair: `check` throws when its law fails.
 *
 * @param functor The functor to check: its boxes, and its map.
 * @returns One `[description, check]` pair per law, for each box of the functor.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { functorLaws } from "@tinker/functional/testing";
 *
 * for (const [description, check] of functorLaws(myFunctor)) {
 *   test(description, check);
 * }
 * ```
 */
export function functorLaws<M, A>(functor: FunctorUnderTest<M, A>): LawCheck[] {
  const { name, samples, map, f, g } = functor;
  const equal = functor.equal ?? isEqual;
  return [
    [`${name}: map with the identity leaves each box unchanged`, () =>
      holdsForAll(
        samples,
        (box) => equal(map(box, (value) => value), box),
        `${name}: map(box, identity) changed a box`,
      ),
    ],
    [`${name}: map composes: map(map(box, f), g) is map(box, g after f)`, () =>
      holdsForAll(
        samples,
        (box) => equal(map(map(box, f), g), map(box, (value) => g(f(value)))),
        `${name}: map does not compose`,
      ),
    ],
  ];
}

/**
 * The chain laws, as checks: flatMap's left identity, right identity and associativity. Use it
 * for a type that has `flatMap` and no `map`. Each check is a `[description, check]` pair: `check`
 * throws when its law fails.
 *
 * @param chain The chain to check: its boxes, its `of`, and its flatMap.
 * @returns One `[description, check]` pair per law, for each box of the chain.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { chainLaws } from "@tinker/functional/testing";
 *
 * for (const [description, check] of chainLaws(myChain)) {
 *   test(description, check);
 * }
 * ```
 */
export function chainLaws<M, A>(chain: ChainUnderTest<M, A>): LawCheck[] {
  const { name, samples, values, of, flatMap, step, nextStep } = chain;
  const equal = chain.equal ?? isEqual;
  return [
    [`${name}: flatMap left identity: flatMap(of(a), step) is step(a)`, () =>
      holdsForAll(
        values,
        (value) => equal(flatMap(of(value), step), step(value)),
        `${name}: flatMap left identity fails`,
      ),
    ],
    [`${name}: flatMap right identity: flatMap(box, of) is box`, () =>
      holdsForAll(
        samples,
        (box) => equal(flatMap(box, of), box),
        `${name}: flatMap right identity fails`,
      ),
    ],
    [`${name}: flatMap associates: flatMap(flatMap(box, step), nextStep) is`
      + ` flatMap(box, a => flatMap(step(a), nextStep))`, () =>
      holdsForAll(
        samples,
        (box) => equal(
          flatMap(flatMap(box, step), nextStep),
          flatMap(box, (value) => flatMap(step(value), nextStep)),
        ),
        `${name}: flatMap does not associate`,
      ),
    ],
  ];
}

/**
 * The monad laws, as checks: the functor laws, the chain laws, and the interaction with `map`,
 * `flatMap` and `match`. Use it to test a monad defined outside this package, with the monad's
 * own samples (include edge values, as in `EDGE_VALUES`). Each check is a `[description, check]`
 * pair: `check` throws when its law fails, so any test framework can run it.
 *
 * @param monad The monad to check: its boxes, `of`, `map`, `flatMap`, and its case names.
 * @returns The functor and chain checks, and the checks of `match`, as `[description, check]`
 * pairs.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { monadLaws } from "@tinker/functional/testing";
 *
 * for (const [description, check] of monadLaws(myMonad)) {
 *   test(description, check);
 * }
 * ```
 */
export function monadLaws<M, A>(monad: MonadUnderTest<M, A>): LawCheck[] {
  const { name, samples, values, of, map, flatMap } = monad;
  const { cases, successCase, caseOf, f } = monad;
  return [
    ...functorLaws(monad),
    ...chainLaws(monad),
    [`${name}: match: every box is in one of the monad's cases`, () =>
      holdsForAll(
        samples,
        (box) => cases.includes(caseOf(box)),
        `${name}: match picked a case that is not one of ${cases.join(", ")}`,
      ),
    ],
    [`${name}: match: of(a) is in the success case`, () =>
      holdsForAll(
        values,
        (value) => caseOf(of(value)) === successCase,
        `${name}: of(a) is not in the ${successCase} case`,
      ),
    ],
    [`${name}: match: map keeps the case of each box`, () =>
      holdsForAll(
        samples,
        (box) => caseOf(map(box, f)) === caseOf(box),
        `${name}: map changed the case of a box`,
      ),
    ],
    [`${name}: match: flatMap(box, of) keeps the case of each box`, () =>
      holdsForAll(
        samples,
        (box) => caseOf(flatMap(box, of)) === caseOf(box),
        `${name}: flatMap(box, of) changed the case of a box`,
      ),
    ],
  ];
}

/** An optic to check: the optic, the wholes it reads, and the parts it writes. */
interface OpticUnderTest<S, A, O> {
  /** The name shown in each description, e.g. "prop(name)". */
  readonly name: string;
  /** The optic to check. */
  readonly optic: O;
  /** Wholes to test the laws on. For an Optional, include wholes with the part and without. */
  readonly samples: readonly S[];
  /** Parts to write into each whole. */
  readonly values: readonly A[];
  /**
   * Whether two wholes, or two parts, are equal. Defaults to `isEqual`, under which two objects
   * are equal only when they are the same object: give a structural equality for records.
   */
  readonly equal?: (a: unknown, b: unknown) => boolean;
}

/** An Iso to check. */
export type IsoUnderTest<S, A> = OpticUnderTest<S, A, Iso<S, A>>;
/** A Lens to check. */
export type LensUnderTest<S, A> = OpticUnderTest<S, A, Lens<S, A>>;
/** An Optional to check. */
export type OptionalUnderTest<S, A> = OpticUnderTest<S, A, Optional<S, A>>;

/**
 * Every pair of a whole and a part, and of a whole and two parts.
 *
 * @param samples The wholes.
 * @param values The parts.
 * @returns The pairs `[whole, part]`, and the triples `[whole, first, second]`.
 */
const combinations = <S, A>(samples: readonly S[], values: readonly A[]): {
  readonly pairs: readonly (readonly [S, A])[];
  readonly triples: readonly (readonly [S, A, A])[];
} => {
  const pairs = samples.flatMap((whole) => values.map((part) => [whole, part] as const));
  const triples = pairs.flatMap(([whole, first]) =>
    values.map((second) => [whole, first, second] as const));
  return { pairs, triples };
};

/**
 * The iso laws, as checks: `to` and `from` undo each other, both ways. Each check is a
 * `[description, check]` pair: `check` throws when its law fails.
 *
 * @param under The Iso to check: the Iso, its wholes, and its parts.
 * @returns One `[description, check]` pair per law.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { isoLaws } from "@tinker/functional/testing";
 *
 * for (const [description, check] of isoLaws({ name: "cents", optic, samples, values })) {
 *   test(description, check);
 * }
 * ```
 */
export function isoLaws<S, A>(under: IsoUnderTest<S, A>): LawCheck[] {
  const { name, optic, samples, values } = under;
  const equal = under.equal ?? isEqual;
  return [
    [`${name}: from(to(s)) is s`, () =>
      holdsForAll(
        samples,
        (whole) => equal(optic.from(optic.to(whole)), whole),
        `${name}: from(to(s)) changed a whole`,
      ),
    ],
    [`${name}: to(from(a)) is a`, () =>
      holdsForAll(
        values,
        (part) => equal(optic.to(optic.from(part)), part),
        `${name}: to(from(a)) changed a part`,
      ),
    ],
  ];
}

/**
 * The lens laws, as checks. get-set: setting the part a whole holds returns that same whole (the
 * same object, so a signal holding it sees no change). set-get: reading after a set gives the
 * part that was set. set-set: a second set replaces the first. Each check is a
 * `[description, check]` pair: `check` throws when its law fails.
 *
 * @param under The Lens to check: the Lens, its wholes, and its parts.
 * @returns One `[description, check]` pair per law.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { isDeepStrictEqual } from "node:util";
 * import { lensLaws } from "@tinker/functional/testing";
 *
 * const laws = lensLaws({ name: "name", optic, samples, values, equal: isDeepStrictEqual });
 * for (const [description, check] of laws) {
 *   test(description, check);
 * }
 * ```
 */
export function lensLaws<S, A>(under: LensUnderTest<S, A>): LawCheck[] {
  const { name, optic, samples, values } = under;
  const equal = under.equal ?? isEqual;
  const { pairs, triples } = combinations(samples, values);
  return [
    [`${name}: get-set: set(get(s), s) is the same s`, () =>
      holdsForAll(
        samples,
        (whole) => optic.set(optic.get(whole), whole) === whole,
        `${name}: set(get(s), s) did not return the same whole`,
      ),
    ],
    [`${name}: set-get: get(set(a, s)) is a`, () =>
      holdsForAll(
        pairs,
        ([whole, part]) => equal(optic.get(optic.set(part, whole)), part),
        `${name}: get(set(a, s)) is not a`,
      ),
    ],
    [`${name}: set-set: set(b, set(a, s)) is set(b, s)`, () =>
      holdsForAll(
        triples,
        ([whole, first, second]) =>
          equal(optic.set(second, optic.set(first, whole)), optic.set(second, whole)),
        `${name}: set(b, set(a, s)) is not set(b, s)`,
      ),
    ],
  ];
}

/**
 * The optional laws, as checks. preview-set: setting the part a whole holds returns that same
 * whole. no part: setting a part into a whole that has none returns that same whole. set-preview:
 * when the whole has the part, previewing after a set gives the part that was set. set-set: a
 * second set replaces the first. Each check is a `[description, check]` pair: `check` throws when
 * its law fails.
 *
 * @param under The Optional to check: the Optional, its wholes (with the part and without), and
 * its parts.
 * @returns One `[description, check]` pair per law.
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { optionalLaws } from "@tinker/functional/testing";
 *
 * for (const [description, check] of optionalLaws({ name: "at(1)", optic, samples, values })) {
 *   test(description, check);
 * }
 * ```
 */
export function optionalLaws<S, A>(under: OptionalUnderTest<S, A>): LawCheck[] {
  const { name, optic, samples, values } = under;
  const equal = under.equal ?? isEqual;
  const { pairs, triples } = combinations(samples, values);
  const holding = pairs.filter(([whole]) => isSome(optic.preview(whole)));
  const empty = pairs.filter(([whole]) => !isSome(optic.preview(whole)));
  return [
    [`${name}: preview-set: setting the part s holds is the same s`, () =>
      holdsForAll(
        samples,
        (whole) => optic.modify((part) => part, whole) === whole,
        `${name}: setting the part a whole holds did not return the same whole`,
      ),
    ],
    [`${name}: no part: set(a, s) is the same s when s has no part`, () =>
      holdsForAll(
        empty,
        ([whole, part]) => optic.set(part, whole) === whole,
        `${name}: set(a, s) changed a whole that has no part`,
      ),
    ],
    [`${name}: set-preview: preview(set(a, s)) is Some(a) when s has a part`, () =>
      holdsForAll(
        holding,
        ([whole, part]) => isSameSome(optic.preview(optic.set(part, whole)), part, equal),
        `${name}: preview(set(a, s)) is not Some(a)`,
      ),
    ],
    [`${name}: set-set: set(b, set(a, s)) is set(b, s)`, () =>
      holdsForAll(
        triples,
        ([whole, first, second]) =>
          equal(optic.set(second, optic.set(first, whole)), optic.set(second, whole)),
        `${name}: set(b, set(a, s)) is not set(b, s)`,
      ),
    ],
  ];
}

/**
 * Whether `maybe` is a Some holding a value equal to `part`.
 *
 * @param maybe The Maybe to read.
 * @param part The value it should hold.
 * @param equal Whether two parts are equal.
 * @returns `true` when `maybe` is a Some holding a part equal to `part`.
 */
const isSameSome = <A>(
  maybe: Maybe<A>,
  part: A,
  equal: (a: unknown, b: unknown) => boolean,
): boolean => match(maybe, { Some: (value) => equal(value, part), None: () => false });

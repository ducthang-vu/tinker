// The law checkers: for a functor, a chain or a monad defined outside this package, they return the
// law checks as [description, check] pairs, so any test framework can run them. See `functorLaws`,
// `chainLaws` and `monadLaws`.
import { isEqual } from "./monad.ts";

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

/** Throws, with `message`, unless `holds` is true for every item: a pipeline, with no loop. */
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
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { functorLaws } from "@tinker/functional/v1/testing";
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
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { chainLaws } from "@tinker/functional/v1/testing";
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
 * @example
 * ```ts
 * import { test } from "vitest";
 * import { monadLaws } from "@tinker/functional/v1/testing";
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

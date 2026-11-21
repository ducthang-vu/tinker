// Checks that a monad obeys the monad laws, and that its boxes work with map, flatMap and match.
// It returns [description, check] pairs: each check throws when it fails, so any test framework
// can run them, e.g. `for (const [name, check] of monadLaws(m)) test(name, check)`.

/** A monad to check: its boxes, values, operations, and how its match names a box's case. */
export interface MonadUnderTest<M, A> {
  /** The name shown in each description, e.g. "Maybe". */
  readonly name: string;
  /** Boxes to test the laws on. Include a success, a failure or none, and a nested box. */
  readonly samples: readonly M[];
  /** Values to test the left identity on. */
  readonly values: readonly A[];
  /** Builds a box holding a value: the monad's `of`, e.g. `Some.of`. */
  readonly of: (value: A) => M;
  /** The monad's map, data-first. */
  readonly map: (box: M, f: (value: A) => A) => M;
  /** The monad's flatMap, data-first. */
  readonly flatMap: (box: M, f: (value: A) => M) => M;
  /** Whether two boxes are equal. The laws compare boxes with it. */
  readonly equal: (a: M, b: M) => boolean;
  /** The names of the monad's cases, e.g. ["Some", "None"]. */
  readonly cases: readonly string[];
  /** The case that `of` builds, e.g. "Some". */
  readonly successCase: string;
  /** The case a box is in, read through the monad's match, e.g. `match(box, { Some, None })`. */
  readonly caseOf: (box: M) => string;
  /** Two transforms for the map laws. */
  readonly f: (value: A) => A;
  readonly g: (value: A) => A;
  /** Two steps for the flatMap laws. */
  readonly step: (value: A) => M;
  readonly nextStep: (value: A) => M;
}

/** A check: its description, and a function that throws when the law does not hold. */
export type LawCheck = readonly [description: string, check: () => void];

/** Throws, with `message`, unless `condition` holds. */
function expectTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/** The monad laws, and the interaction with map, flatMap and match, as checks. */
export function monadLaws<M, A>(monad: MonadUnderTest<M, A>): LawCheck[] {
  const { name, samples, values, of, map, flatMap, equal } = monad;
  const { cases, successCase, caseOf, f, g, step, nextStep } = monad;
  return [
    [`${name}: map with the identity leaves each box unchanged`, () => {
      for (const box of samples) {
        expectTrue(equal(map(box, (value) => value), box), `${name}: map(box, identity) changed a box`);
      }
    }],
    [`${name}: map composes: map(map(box, f), g) is map(box, g after f)`, () => {
      for (const box of samples) {
        expectTrue(
          equal(map(map(box, f), g), map(box, (value) => g(f(value)))),
          `${name}: map does not compose`,
        );
      }
    }],
    [`${name}: flatMap left identity: flatMap(of(a), step) is step(a)`, () => {
      for (const value of values) {
        expectTrue(equal(flatMap(of(value), step), step(value)), `${name}: flatMap left identity fails`);
      }
    }],
    [`${name}: flatMap right identity: flatMap(box, of) is box`, () => {
      for (const box of samples) {
        expectTrue(equal(flatMap(box, of), box), `${name}: flatMap right identity fails`);
      }
    }],
    [`${name}: flatMap associates: flatMap(flatMap(box, step), nextStep) is`
      + ` flatMap(box, a => flatMap(step(a), nextStep))`, () => {
      for (const box of samples) {
        expectTrue(
          equal(
            flatMap(flatMap(box, step), nextStep),
            flatMap(box, (value) => flatMap(step(value), nextStep)),
          ),
          `${name}: flatMap does not associate`,
        );
      }
    }],
    [`${name}: match: every box is in one of the monad's cases`, () => {
      for (const box of samples) {
        expectTrue(cases.includes(caseOf(box)), `${name}: match picked a case that is not one of ${cases.join(", ")}`);
      }
    }],
    [`${name}: match: of(a) is in the success case`, () => {
      for (const value of values) {
        expectTrue(caseOf(of(value)) === successCase, `${name}: of(a) is not in the ${successCase} case`);
      }
    }],
    [`${name}: match: map keeps the case of each box`, () => {
      for (const box of samples) {
        expectTrue(caseOf(map(box, f)) === caseOf(box), `${name}: map changed the case of a box`);
      }
    }],
    [`${name}: match: flatMap(box, of) keeps the case of each box`, () => {
      for (const box of samples) {
        expectTrue(
          caseOf(flatMap(box, of)) === caseOf(box),
          `${name}: flatMap(box, of) changed the case of a box`,
        );
      }
    }],
  ];
}

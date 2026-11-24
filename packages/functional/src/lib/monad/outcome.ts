// The outcome protocol: a value either continues a chain with a value, or halts it with a reason.
// A halt is not always a failure (a redirect is a halt), so the names describe continue and halt,
// not success and failure. A value implements the protocol under the OUTCOME symbol. Right and a
// succeeding Task continue; Left and a failing Task halt. Build the two halves with
// `Continue.of(value)` and `Halt.of(reason)`.

/**
 * The symbol under which a value says whether it continues or halts.
 *
 * @developerRemarks In principle one would read every monad with `match`, as the rest of the
 * library does. The protocol exists for a practical reason: it lets a converter such as
 * `createEither` take any value that can answer continue or halt, including one a user defines,
 * without the library knowing its type. Use `match` when the value is one of the library's own
 * monads.
 */
export const OUTCOME: unique symbol = Symbol("outcome");

/** A value that says whether its chain continues with a value, or halts with a reason. */
export interface Outcome<T, E> {
  [OUTCOME](): Continue<T> | Halt<E>;
}

/** The continue half: the chain goes on, and the next step receives `value`. */
export class Continue<T> implements Outcome<T, never> {
  /**
   * Creates the case. Use `Continue.of` instead.
   *
   * @param value The value the next step receives.
   */
  private constructor(readonly value: T) {}

  /**
   * The value itself: a Continue is already in the protocol's form.
   *
   * @returns This Continue.
   */
  [OUTCOME](): Continue<T> {
    return this;
  }

  /**
   * A continue with `value`.
   *
   * @param value The value the next step receives.
   * @returns A Continue holding `value`.
   */
  static of<T>(value: T): Continue<T> {
    return new Continue<T>(value);
  }
}

/** The halt half: the chain stops, with `reason` as the reason. Not necessarily a failure. */
export class Halt<E> implements Outcome<never, E> {
  /**
   * Creates the case. Use `Halt.of` instead.
   *
   * @param reason Why the chain stopped.
   */
  private constructor(readonly reason: E) {}

  /**
   * The value itself: a Halt is already in the protocol's form.
   *
   * @returns This Halt.
   */
  [OUTCOME](): Halt<E> {
    return this;
  }

  /**
   * A halt with `reason`.
   *
   * @param reason Why the chain stopped.
   * @returns A Halt holding `reason`.
   */
  static of<E>(reason: E): Halt<E> {
    return new Halt<E>(reason);
  }
}

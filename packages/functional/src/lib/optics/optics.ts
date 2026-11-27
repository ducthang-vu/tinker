// Optics: a part of an immutable value, seen through a pair of functions, one to read the part
// and one to write it back. Writing never changes the whole: it returns a new whole, which shares
// every branch the write did not touch.
//
//   const city = compose(prop<User>()("address"), prop<Address>()("city"));  // Lens<User, string>
//   city.get(user);                // "Paris"
//   city.set("Rome", user);        // a new user, with a new address; the rest is shared
//
// Three kinds, from the strongest to the weakest:
//
// - Iso: the whole and the part are two forms of the same value (`to`, `from`).
// - Lens: the part is always there (`get`, `set`).
// - Optional: the part may be missing (`preview` returns a Maybe; `set` on a whole without the
//   part returns the whole unchanged).
//
// Composing two optics gives the weaker kind of the two (see `compose`).
//
// The rule every optic here follows, and that the signals rely on: setting the part to the value
// it already holds returns the same whole, not a copy. A signal holding the whole then sees no
// change, and notifies no one.

import { flatMap, map } from "../functor/functor.ts";
import { getOrElse, type Maybe, Some } from "../monad/maybe.ts";

/**
 * An optic whose part is two-way convertible with the whole: `to` reads the part, `from` builds
 * the whole back from it. The Adapter pattern, for values.
 *
 * @example
 * ```ts
 * import { Iso } from "@tinker/functional";
 *
 * const cents = Iso.of((euros: number) => Math.round(euros * 100), (c: number) => c / 100);
 * cents.to(1.5);   // 150
 * cents.from(150); // 1.5
 * ```
 */
export class Iso<S, A> {
  /** The kind of optic, for the types: an Iso is not a Lens or an Optional. */
  readonly kind = "Iso";

  /**
   * Creates the optic. Use `Iso.of` instead.
   *
   * @param to Reads the part from the whole.
   * @param from Builds the whole from the part.
   */
  private constructor(
    readonly to: (whole: S) => A,
    readonly from: (part: A) => S,
  ) {}

  /**
   * An Iso from its two conversions. `to` and `from` must undo each other.
   *
   * @param to Reads the part from the whole.
   * @param from Builds the whole from the part.
   * @returns The Iso.
   */
  static of<S, A>(to: (whole: S) => A, from: (part: A) => S): Iso<S, A> {
    return new Iso(to, from);
  }

  /**
   * The whole with its part changed by `fn`.
   *
   * @param fn Computes the new part from the current one.
   * @param whole The whole to change.
   * @returns The new whole, or `whole` itself when `fn` returns the same part.
   */
  modify(fn: (part: A) => A, whole: S): S {
    return this.toLens()
      .modify(fn, whole);
  }

  /**
   * This Iso as a Lens. Its `set` returns the whole itself, not a rebuilt one, when the part is
   * unchanged.
   *
   * @returns A Lens reading with `to` and writing with `from`.
   */
  toLens(): Lens<S, A> {
    return Lens.of(
      this.to,
      (part, whole) => (Object.is(this.to(whole), part) ? whole : this.from(part)),
    );
  }

  /**
   * This Iso as an Optional whose part is always present.
   *
   * @returns An Optional reading with `to` and writing with `from`.
   */
  toOptional(): Optional<S, A> {
    return this.toLens()
      .toOptional();
  }
}

/**
 * An optic whose part is always present: `get` reads it, `set` returns a new whole holding a new
 * part.
 *
 * @example
 * ```ts
 * import { Lens } from "@tinker/functional";
 *
 * const name = Lens.of(
 *   (user: User) => user.name,
 *   (name: string, user: User) => ({ ...user, name }),
 * );
 * name.set("Ada", user); // a new user named Ada
 * ```
 */
export class Lens<S, A> {
  /** The kind of optic, for the types: a Lens is not an Iso or an Optional. */
  readonly kind = "Lens";

  /**
   * Creates the optic. Use `Lens.of` instead.
   *
   * @param get Reads the part from the whole.
   * @param set Returns the whole with a new part.
   */
  private constructor(
    readonly get: (whole: S) => A,
    readonly set: (part: A, whole: S) => S,
  ) {}

  /**
   * A Lens from its two functions. They must obey the lens laws (see `lensLaws` in
   * `@tinker/functional/testing`), and `set` must return `whole` itself when `part` is the one it
   * holds.
   *
   * @param get Reads the part from the whole.
   * @param set Returns the whole with a new part.
   * @returns The Lens.
   */
  static of<S, A>(get: (whole: S) => A, set: (part: A, whole: S) => S): Lens<S, A> {
    return new Lens(get, set);
  }

  /**
   * The whole with its part changed by `fn`.
   *
   * @param fn Computes the new part from the current one.
   * @param whole The whole to change.
   * @returns The new whole, or `whole` itself when `fn` returns the same part.
   */
  modify(fn: (part: A) => A, whole: S): S {
    return this.set(fn(this.get(whole)), whole);
  }

  /**
   * This Lens itself: a Lens is already a Lens. It lets code take an Iso or a Lens alike.
   *
   * @returns This Lens.
   */
  toLens(): Lens<S, A> {
    return this;
  }

  /**
   * This Lens as an Optional whose part is always present.
   *
   * @returns An Optional whose preview is always a Some.
   */
  toOptional(): Optional<S, A> {
    return Optional.of((whole) => Some.of(this.get(whole)), this.set);
  }
}

/**
 * An optic whose part may be missing: `preview` reads it as a Maybe, and `set` replaces it when
 * it is there. On a whole without the part, `set` returns the whole unchanged: it never adds the
 * part.
 *
 * @example
 * ```ts
 * import { at } from "@tinker/functional";
 *
 * const second = at<number>(1);   // an Optional
 * second.preview([1, 2]);         // Some(2)
 * second.preview([1]);            // None
 * second.set(9, [1]);             // [1]: no second item to replace
 * ```
 */
export class Optional<S, A> {
  /** The kind of optic, for the types: an Optional is not an Iso or a Lens. */
  readonly kind = "Optional";

  /**
   * Creates the optic. Use `Optional.of` instead.
   *
   * @param preview Reads the part, if the whole has one.
   * @param set Returns the whole with a new part, or the whole itself when it has no part.
   */
  private constructor(
    readonly preview: (whole: S) => Maybe<A>,
    readonly set: (part: A, whole: S) => S,
  ) {}

  /**
   * An Optional from its two functions. They must obey the optional laws (see `optionalLaws` in
   * `@tinker/functional/testing`): `set` returns `whole` itself when the whole has no part, or
   * when `part` is the one it holds.
   *
   * @param preview Reads the part, if the whole has one.
   * @param set Returns the whole with a new part, or the whole itself when it has no part.
   * @returns The Optional.
   */
  static of<S, A>(preview: (whole: S) => Maybe<A>, set: (part: A, whole: S) => S): Optional<S, A> {
    return new Optional(preview, set);
  }

  /**
   * The whole with its part changed by `fn`, when it has one.
   *
   * @param fn Computes the new part from the current one.
   * @param whole The whole to change.
   * @returns The new whole, or `whole` itself when it has no part or `fn` returns the same one.
   */
  modify(fn: (part: A) => A, whole: S): S {
    return getOrElse(map(this.preview(whole), (part) => this.set(fn(part), whole)), whole);
  }

  /**
   * This Optional itself. It lets code take any optic as an Optional.
   *
   * @returns This Optional.
   */
  toOptional(): Optional<S, A> {
    return this;
  }
}

/** Any optic: an Iso, a Lens or an Optional. */
export type Optic<S, A> = Iso<S, A> | Lens<S, A> | Optional<S, A>;

/**
 * The optic that reads `inner` inside the part `outer` reads. The result is the weaker kind of
 * the two: two Isos give an Iso; Isos and Lenses give a Lens; any Optional gives an Optional.
 *
 * @param outer The optic from the whole to the middle part.
 * @param inner The optic from the middle part to the part.
 * @returns The optic from the whole to the part.
 * @example
 * ```ts
 * import { compose, prop } from "@tinker/functional";
 *
 * const city = compose(prop<User>()("address"), prop<Address>()("city")); // Lens<User, string>
 * ```
 */
export function compose<S, A, B>(outer: Iso<S, A>, inner: Iso<A, B>): Iso<S, B>;
export function compose<S, A, B>(
  outer: Iso<S, A> | Lens<S, A>,
  inner: Iso<A, B> | Lens<A, B>,
): Lens<S, B>;
export function compose<S, A, B>(outer: Optic<S, A>, inner: Optic<A, B>): Optional<S, B>;
export function compose<S, A, B>(outer: Optic<S, A>, inner: Optic<A, B>): Optic<S, B> {
  if (outer instanceof Iso && inner instanceof Iso) {
    return Iso.of((whole) => inner.to(outer.to(whole)), (part) => outer.from(inner.from(part)));
  }
  if (!(outer instanceof Optional) && !(inner instanceof Optional)) {
    return composeLenses(outer.toLens(), inner.toLens());
  }
  return composeOptionals(outer.toOptional(), inner.toOptional());
}

/**
 * Two Lenses, one inside the other, as one Lens.
 *
 * @param outer The Lens from the whole to the middle part.
 * @param inner The Lens from the middle part to the part.
 * @returns The Lens from the whole to the part.
 */
function composeLenses<S, A, B>(outer: Lens<S, A>, inner: Lens<A, B>): Lens<S, B> {
  return Lens.of(
    (whole) => inner.get(outer.get(whole)),
    (part, whole) => outer.modify((middle) => inner.set(part, middle), whole),
  );
}

/**
 * Two Optionals, one inside the other, as one Optional.
 *
 * @param outer The Optional from the whole to the middle part.
 * @param inner The Optional from the middle part to the part.
 * @returns The Optional from the whole to the part.
 */
function composeOptionals<S, A, B>(outer: Optional<S, A>, inner: Optional<A, B>): Optional<S, B> {
  return Optional.of(
    (whole) => flatMap(outer.preview(whole), inner.preview),
    (part, whole) => outer.modify((middle) => inner.set(part, middle), whole),
  );
}

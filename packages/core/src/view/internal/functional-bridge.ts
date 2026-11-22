// The bridge between the v0 functional API, which core still uses, and the v1 API, which the
// template layer is moving to. Each function converts at the boundary and reads the value with its
// own `match`, so neither side depends on the other's internals. Remove a function once nothing
// calls it.

import { Either as LegacyEither, Maybe as LegacyMaybe } from "@tinker/functional";
import { Left, match, None, Right, Some, type Either, type Maybe } from "@tinker/functional/v1";

/** A v0 Maybe as a v1 Maybe. */
export function maybeFromLegacy<T>(maybe: LegacyMaybe<T>): Maybe<T> {
  return match(maybe, { Some: (value) => Some.of(value), None: () => None.of<T>() });
}

/** A v1 Maybe as a v0 Maybe. */
export function maybeToLegacy<T>(maybe: Maybe<T>): LegacyMaybe<T> {
  return match(maybe, {
    Some: (value) => LegacyMaybe.some(value),
    None: () => LegacyMaybe.none<T>(),
  });
}

/** A v0 Either as a v1 Either. */
export function eitherFromLegacy<T, E>(either: LegacyEither<T, E>): Either<T, E> {
  return match(either, { Right: (value) => Right.of<T, E>(value), Left: (error) => Left.of<E, T>(error) });
}

/** A v1 Either as a v0 Either. */
export function eitherToLegacy<T, E>(either: Either<T, E>): LegacyEither<T, E> {
  return match(either, {
    Right: (value) => LegacyEither.right<T, E>(value),
    Left: (error) => LegacyEither.left<T, E>(error),
  });
}

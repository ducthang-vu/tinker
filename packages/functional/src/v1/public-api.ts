// The public API of the v1 functional library: import it as `@tinker/functional/v1`.

export { MATCHABLE, match, EQUALS, isEqual, equalCases } from "./monad.ts";
export type { Case, Matchable, Equatable } from "./monad.ts";
export { Right, Left, mapLeft, attempt, toError } from "./either.ts";
export type { Either, EitherCases } from "./either.ts";
export { Some, None, filter, toEither, fromEither, isSome, isNone } from "./maybe.ts";
export type { Maybe, MaybeCases } from "./maybe.ts";
export { map, flatMap } from "./functor.ts";
export type { MapFn, EitherFlatMapFn, MaybeFlatMapFn } from "./functor.ts";
export { implementMap, implementFlatMap } from "./registry.ts";
export type { MapImpl, FlatMapImpl } from "./registry.ts";

// The public API of the v1 functional library: import it as `@tinker/functional`.

export { MATCHABLE, match, use, EQUALS, isEqual, equalCases } from "./lib/monad/monad.ts";
export type { Case, Matchable, Equatable, EitherEffects, MaybeEffects } from "./lib/monad/monad.ts";
export { Right, Left, mapLeft, attempt, toError, valueOrThrow } from "./lib/monad/either.ts";
export type { Either, EitherCases } from "./lib/monad/either.ts";
export { createEither } from "./lib/monad/either.ts";
export { Continue, Halt, OUTCOME } from "./lib/monad/outcome.ts";
export type { Outcome } from "./lib/monad/outcome.ts";
export {
  Some,
  None,
  filter,
  fromNullable,
  getOrElse,
  getOrThrow,
  orElse,
  toEither,
  fromEither,
  isSome,
  isNone,
} from "./lib/monad/maybe.ts";
export type { Maybe, MaybeCases } from "./lib/monad/maybe.ts";
export { createMaybe } from "./lib/monad/maybe.ts";
export { map, flatMap, sequence, MAP, CHAIN } from "./lib/functor/functor.ts";
export type {
  Functor,
  Chain,
  MapFn,
  EitherFlatMapFn,
  MaybeFlatMapFn,
} from "./lib/functor/functor.ts";
export { implementMap, implementFlatMap } from "./lib/functor/registry.ts";
export type { MapImpl, FlatMapImpl } from "./lib/functor/registry.ts";
export {
  Stream,
  run,
  subscribe,
  mapErrors,
} from "./lib/stream/stream.ts";
export type {
  Cancel,
  StreamComputation,
  StreamHandlers,
  StreamObserver,
  StreamSink,
} from "./lib/stream/stream.ts";
export { pipe, flow, partial } from "./lib/function.ts";
export { Emitter } from "./lib/stream/emitter.ts";
export {
  type Task,
  type TaskComputation,
  type TaskHandlers,
  TimeoutError,
  delay,
  fail,
  fromComputation,
  fromOutcome,
  fromPromise,
  succeed,
  createTask,
  timeout,
  toPromise,
} from "./lib/stream/task.ts";

// The public entry point for functional utilities: monads sharing one
// vocabulary (some, right, succeed, end, map, flatMap, match). `map` and `flatMap` also
// work as functions for `pipe`: `Maybe.map(f)(m)` and `Maybe.map(m, f)`.
//   Maybe<T>         a value that may be absent
//   Either<E, T>     a success or a failure
//   Task<T, E>       one value later: a lazy, cancellable Promise (and timers)
//   Stream<T, R, E>  many values later, then an end: the many-valued sibling of
//                    Task (a Task is a Stream with no items). Failures are
//                    values (Either items) and never end a stream.
//   Emitter<T, R, E> a hot source of a Stream, e.g. the output of a directive

export { Either } from "./either.ts";
export type { EitherError } from "./either.ts";
export { Emitter } from "./emitter.ts";
export { pipe } from "./pipe.ts";
export { partial } from "./function.ts";
export { Maybe } from "./maybe.ts";
export { Stream } from "./stream.ts";
export type {
  Cancel,
  StreamComputation,
  StreamHandlers,
  StreamObserver,
  StreamSink,
} from "./stream.ts";
export { Task, TimeoutError } from "./task.ts";
export type { TaskHandlers } from "./task.ts";

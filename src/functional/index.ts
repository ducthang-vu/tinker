// The public entry point for functional utilities: three monads sharing one
// vocabulary (of, map, flatMap, match).
//   Maybe<T>      a value that may be absent
//   Either<E, T>  a success or a failure
//   Task<T>       one value later: a lazy, cancellable Promise (and timers)

export { Either } from "./either.ts";
export type { EitherError } from "./either.ts";
export { Maybe } from "./maybe.ts";
export { Task, TimeoutError } from "./task.ts";
export type { Cancel, TaskHandlers } from "./task.ts";

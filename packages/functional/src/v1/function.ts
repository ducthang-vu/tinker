// pipe and flow: plain function composition, for steps written data-last (`map(f)`, `flatMap(f)`).
// `pipe` applies the functions to a value, left to right. `flow` makes a function out of them.

/** `value` passed through each function in turn, left to right. */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, f1: (a: A) => B): B;
export function pipe<A, B, C>(value: A, f1: (a: A) => B, f2: (b: B) => C): C;
export function pipe<A, B, C, D>(value: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  value: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  value: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F;
export function pipe(value: unknown, ...fns: readonly ((input: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/** A function that applies `f1`, then `f2`, and so on: `flow(f, g)(x)` is `g(f(x))`. */
export function flow<A extends unknown[], B>(f1: (...args: A) => B): (...args: A) => B;
export function flow<A extends unknown[], B, C>(
  f1: (...args: A) => B,
  f2: (b: B) => C,
): (...args: A) => C;
export function flow<A extends unknown[], B, C, D>(
  f1: (...args: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
): (...args: A) => D;
export function flow<A extends unknown[], B, C, D, E>(
  f1: (...args: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
): (...args: A) => E;
export function flow(
  first: (...args: unknown[]) => unknown,
  ...fns: readonly ((input: unknown) => unknown)[]
): (...args: unknown[]) => unknown {
  return (...args) => fns.reduce((acc, fn) => fn(acc), first(...args));
}

/** The function with its first arguments fixed to `given`, taking the rest. */
export function partial<A extends unknown[], B extends unknown[], R>(
  f: (...args: [...A, ...B]) => R,
  ...given: A
): (...rest: B) => R {
  return (...rest) => f(...[...given, ...rest] as [...A, ...B]);
}

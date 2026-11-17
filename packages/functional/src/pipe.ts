// pipe: feeds a value through functions in order, pipe(value, f, g, …) being g(f(value)).
// Each overload keeps the type of every step, up to 10.

/** `pipe(value, f, g, …)`: `g(f(value))`, and so on, typed step by step. */
export function pipe<A>(
  a: A,
): A;

export function pipe<A, B>(
  a: A,
  f1: (x: A) => B,
): B;

export function pipe<A, B, C>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
): C;

export function pipe<A, B, C, D>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
): D;

export function pipe<A, B, C, D, E>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
): E;

export function pipe<A, B, C, D, E, F>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
): F;

export function pipe<A, B, C, D, E, F, G>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
): G;

export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
): H;

export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
  f8: (x: H) => I,
): I;

export function pipe<A, B, C, D, E, F, G, H, I, J>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
  f8: (x: H) => I,
  f9: (x: I) => J,
): J;

export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
  f8: (x: H) => I,
  f9: (x: I) => J,
  f10: (x: J) => K,
): K;

export function pipe(value: unknown, ...fns: ((input: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

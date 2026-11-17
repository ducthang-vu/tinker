// pipe and flow: composing steps. pipe(value, f, g, …) feeds the value through
// the functions in order; flow(f, g, …) makes one function out of them, for a
// step that is reused. Each overload keeps the type of every step, up to 10.

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

/** `flow(f, g, …)`: a function running `f` on its arguments, then `g`, and so on. */
export function flow<Args extends unknown[], A>(
  f0: (...args: Args) => A,
): (...args: Args) => A;

export function flow<Args extends unknown[], A, B>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
): (...args: Args) => B;

export function flow<Args extends unknown[], A, B, C>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
): (...args: Args) => C;

export function flow<Args extends unknown[], A, B, C, D>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
): (...args: Args) => D;

export function flow<Args extends unknown[], A, B, C, D, E>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
): (...args: Args) => E;

export function flow<Args extends unknown[], A, B, C, D, E, F>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
): (...args: Args) => F;

export function flow<Args extends unknown[], A, B, C, D, E, F, G>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
): (...args: Args) => G;

export function flow<Args extends unknown[], A, B, C, D, E, F, G, H>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
): (...args: Args) => H;

export function flow<Args extends unknown[], A, B, C, D, E, F, G, H, I>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
  f8: (x: H) => I,
): (...args: Args) => I;

export function flow<Args extends unknown[], A, B, C, D, E, F, G, H, I, J>(
  f0: (...args: Args) => A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
  f5: (x: E) => F,
  f6: (x: F) => G,
  f7: (x: G) => H,
  f8: (x: H) => I,
  f9: (x: I) => J,
): (...args: Args) => J;

export function flow<Args extends unknown[], A, B, C, D, E, F, G, H, I, J, K>(
  f0: (...args: Args) => A,
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
): (...args: Args) => K;

export function flow(
  first: (...args: unknown[]) => unknown,
  ...fns: ((input: unknown) => unknown)[]
): (...args: unknown[]) => unknown {
  return (...args) => fns.reduce((acc, fn) => fn(acc), first(...args));
}

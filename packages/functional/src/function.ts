// Functions as values. partial fixes the first arguments of a function, and
// returns a function that takes the rest:  partial((a, b, c) => a + b + c, 1, 2)(3)  is 6.

/** The function with its first arguments fixed to `given`, taking the rest. */
export function partial<A extends unknown[], B extends unknown[], R>(
  f: (...args: [...A, ...B]) => R,
  ...given: A
): (...rest: B) => R {
  return (...rest) => f(...[...given, ...rest] as [...A, ...B]);
}

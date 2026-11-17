// Functions as values: flip swaps the first two arguments of a function, and
// partial fixes its first arguments, returning a function that takes the rest.
//   flip((a, b) => a - b)(1, 10)                  9
//   partial((a, b, c) => a + b + c, 1, 2)(3)      6

/** The function with its first two arguments swapped. */
export function flip<A, B, R>(f: (a: A, b: B) => R): (b: B, a: A) => R {
  return (b, a) => f(a, b);
}

/** The function with its first arguments fixed to `given`, taking the rest. */
export function partial<A extends unknown[], B extends unknown[], R>(
  f: (...args: [...A, ...B]) => R,
  ...given: A
): (...rest: B) => R {
  return (...rest) => f(...[...given, ...rest] as [...A, ...B]);
}

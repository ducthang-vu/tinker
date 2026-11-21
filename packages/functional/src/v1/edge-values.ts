// Normal values and edge cases, for tests. Every interaction of a monad is tested on each one.
export const EDGE_VALUES: readonly unknown[] = [
  0, -0, 1, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
  "", " ", "text", "null", "0",
  true, false,
  null, undefined,
  [], [undefined], [null], [0], [[]], [1, 2, 3], [, 1],
  {}, { a: undefined }, { a: null }, { a: 1 }, { "": 0 },
  new Set(), new Set([0]), new Map(), new Map([["k", 1]]),
  new Date(0), 0n, Symbol("s"), Math.max,
];

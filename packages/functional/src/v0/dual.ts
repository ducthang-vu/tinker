// dual: one function usable in two ways, told apart by how many arguments it gets.
//   Maybe.map(m, f)   data-first: the value comes first, and the call runs now
//   Maybe.map(f)      data-last: waits for the value, so it fits pipe(m, Maybe.map(f))
// It is currying with the value allowed in either position. The count decides,
// not the types, so each static is written once and typed with overloads.

/**
 * `impl` takes `arity` arguments in full. Given fewer, the result is a function
 * that takes the missing first argument (the value) and runs `impl` on it.
 * `F` is the overloaded type of the static, which the caller declares.
 */
export function dual<F>(arity: number, impl: (...args: never[]) => unknown): F {
  const callable = (...args: unknown[]): unknown => args.length >= arity
    ? impl(...(args as never[]))
    : (self: unknown) => impl(...([self, ...args] as never[]));
  return callable as unknown as F;
}

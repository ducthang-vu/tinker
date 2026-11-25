// The built-in template functions: names every template has, without an import. A component
// may not declare a member or import one with the same name: the build refuses it.

/**
 * `flow(f, g, …)`: a function that applies `f` to its arguments, then `g` to the result, and so on,
 * from left to right, as `flow` in `@tinker/functional` does.
 *
 * @param fns The functions to apply, in order; at least one.
 * @returns A function of the arguments of the first one, giving the result of the last one.
 * @throws If there are no functions, or one of them is not a function.
 */
function flow(...fns: unknown[]): (...args: unknown[]) => unknown {
  if (fns.length === 0) {
    throw new TypeError("flow needs at least one function");
  }
  const steps = fns.map((fn) => {
    if (typeof fn !== "function") {
      throw new TypeError("flow takes functions only");
    }
    return fn as (...args: unknown[]) => unknown;
  });
  const [first, ...rest] = steps as [
    (...args: unknown[]) => unknown,
    ...((...args: unknown[]) => unknown)[],
  ];
  return (...args) => rest.reduce((value, step) => step(value), first(...args));
}

/** The built-in template functions, by the name a template calls them by. */
export const BUILT_IN_FUNCTIONS: Readonly<Record<string, (...args: unknown[]) => unknown>> = {
  flow,
};

/** The names of the built-in template functions: a member or an import may not take one of them. */
export const BUILT_IN_NAMES: readonly string[] = Object.keys(BUILT_IN_FUNCTIONS);

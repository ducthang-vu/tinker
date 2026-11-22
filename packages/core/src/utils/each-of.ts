import { flatMap, map, Right, type Either } from "@tinker/functional";

/**
 * Runs `step` on each item, in order. The results, or the first error: the
 * steps after a failed one are not run.
 */
export function eachOf<T, U, E>(
  items: readonly T[],
  step: (item: T) => Either<U, E>,
): Either<readonly U[], E> {
  return items.reduce<Either<readonly U[], E>>(
    (done, item) => flatMap(done, (results) => runNext(results, item, step)),
    Right.of<readonly U[], E>([]),
  );
}

/**
 * Runs the step on `item`, only when the earlier items all succeeded (the caller
 * calls it from inside a flatMap), and adds its result to `results`.
 */
function runNext<T, U, E>(
  results: readonly U[],
  item: T,
  step: (item: T) => Either<U, E>,
): Either<readonly U[], E> {
  return map(step(item), (next) => [...results, next]);
}

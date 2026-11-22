import { flatMap, map, Right, type Either } from "@tinker/functional/v1";

/**
 * Runs `step` on each item, in order. The results, or the first error: the
 * steps after a failed one are not run.
 */
export function eachOf<T, U, E>(
  items: readonly T[],
  step: (item: T) => Either<U, E>,
): Either<readonly U[], E> {
  return items.reduce<Either<readonly U[], E>>(
    (done, item) => flatMap(done, (results) =>
      map(step(item), (next) => [...results, next])),
    Right.of<readonly U[], E>([]),
  );
}

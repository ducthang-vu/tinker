// Ready-made optics for plain data: `prop` for a key of a record, `at` for an index of a list,
// and `byKey` for the item of a list that has a given key. Each one copies only what it changes,
// and returns the whole itself when the new part is the one it already holds (by `Object.is`).

import { isEqual } from "../monad/monad.ts";
import { None, Some } from "../monad/maybe.ts";
import { Lens, Optional } from "./optics.ts";

/**
 * A Lens on one key of a plain record. It is curried, so the record type is given and the key is
 * checked against it: `prop<User>()("name")`. Its `set` copies the record with a spread, so the
 * new whole is a plain object: use it on records, not on class instances.
 *
 * @returns A function from a key of `S` to the Lens on that key.
 * @example
 * ```ts
 * import { prop } from "@tinker/functional";
 *
 * const name = prop<User>()("name");
 * name.get(user);         // user.name
 * name.set("Ada", user);  // { ...user, name: "Ada" }
 * ```
 */
export function prop<S extends object>(): <K extends keyof S>(key: K) => Lens<S, S[K]> {
  return <K extends keyof S>(key: K) => Lens.of<S, S[K]>(
    (whole) => whole[key],
    (part, whole) => (Object.is(whole[key], part) ? whole : { ...whole, [key]: part }),
  );
}

/**
 * An Optional on the item at `index` of a list. The item is missing when `index` is not a whole
 * number from 0 to the length of the list, less one (a negative index does not count from the end),
 * and when the list has a hole there: `set` never fills a hole.
 *
 * @param index The position of the item.
 * @returns The Optional on that item.
 * @example
 * ```ts
 * import { at } from "@tinker/functional";
 *
 * at<string>(1).preview(["a", "b"]);   // Some("b")
 * at<string>(1).set("c", ["a", "b"]);  // ["a", "c"]
 * at<string>(5).set("c", ["a", "b"]);  // ["a", "b"], the same list
 * ```
 */
export function at<T>(index: number): Optional<readonly T[], T> {
  const holds = (list: readonly T[]): boolean =>
    Number.isInteger(index) && index >= 0 && index in list;
  return Optional.of(
    (list) => (holds(list) ? Some.of(list[index] as T) : None.of<T>()),
    (item, list) => (holds(list) && !Object.is(list[index], item)
      ? replaced(list, index, item)
      : list),
  );
}

/**
 * An Optional on the first item of a list whose key is `key`. It follows the item, not its
 * position: when items are added, removed or moved, it still reads the same item, and it reads
 * nothing once the item is gone. Keys compare with `isEqual`.
 *
 * The item it sets must keep its key. An item with another key replaces the old one, and the
 * Optional no longer finds it.
 *
 * @param keyOf Reads the key of an item.
 * @param key The key of the item to read.
 * @returns The Optional on that item.
 * @example
 * ```ts
 * import { byKey } from "@tinker/functional";
 *
 * const second = byKey((line: Line) => line.id, 2);
 * second.preview(lines);                                // Some(the line with id 2)
 * second.modify((line) => ({ ...line, qty: 3 }), lines); // a new list, one new line
 * ```
 */
export function byKey<T, K>(keyOf: (item: T) => K, key: K): Optional<readonly T[], T> {
  const indexIn = (list: readonly T[]): number =>
    list.findIndex((item) => isEqual(keyOf(item), key));
  return Optional.of(
    (list) => at<T>(indexIn(list))
      .preview(list),
    (item, list) => at<T>(indexIn(list))
      .set(item, list),
  );
}

/**
 * A copy of `list` with `item` at `index`. Holes elsewhere stay holes.
 *
 * @param list The list to copy.
 * @param index The position to write.
 * @param item The item to write there.
 * @returns The new list.
 */
function replaced<T>(list: readonly T[], index: number, item: T): readonly T[] {
  const copy = list.slice();
  copy[index] = item;
  return copy;
}

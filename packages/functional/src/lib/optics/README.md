# Optics

An optic reads one part of an immutable value, and writes it back. Writing never changes the
value: it returns a new one, which shares every branch the write did not touch.

```ts
import { compose, prop } from "@tinker/functional";

interface Address { readonly city: string; readonly zip: string }
interface User { readonly name: string; readonly address: Address }

const city = compose(prop<User>()("address"), prop<Address>()("city"));

const ada: User = { name: "Ada", address: { city: "Paris", zip: "75001" } };
city.get(ada);                    // "Paris"
const moved = city.set("Rome", ada);
// moved is { name: "Ada", address: { city: "Rome", zip: "75001" } }
// ada is unchanged; moved.address is a new object, the rest is shared
```

The source is in this folder: `optics.ts` (the three kinds and `compose`) and `accessors.ts`
(the ready-made optics). Known gaps are in the package's [IMPROVEMENTS.md](../../../IMPROVEMENTS.md).

- [The three kinds](#the-three-kinds)
- [Ready-made optics](#ready-made-optics)
- [Composing](#composing)
- [The same whole when nothing changes](#the-same-whole-when-nothing-changes)
- [Writing your own optic](#writing-your-own-optic)
- [Testing an optic against its laws](#testing-an-optic-against-its-laws)
- [What optics do not do](#what-optics-do-not-do)

## The three kinds

| Kind | The part | Read | Write |
|---|---|---|---|
| `Iso<S, A>` | is the whole, in another form | `to(whole)` | `from(part)` |
| `Lens<S, A>` | is always there | `get(whole)` | `set(part, whole)` |
| `Optional<S, A>` | may be missing | `preview(whole)`: a `Maybe<A>` | `set(part, whole)` |

Every kind also has `modify(fn, whole)`, which sets the part computed from the current one.

### Iso

The whole and the part hold the same information. `to` and `from` undo each other.

```ts
import { Iso } from "@tinker/functional";

const cents = Iso.of((euros: number) => Math.round(euros * 100), (c: number) => c / 100);
cents.to(1.5);                       // 150
cents.from(150);                     // 1.5
cents.modify((c) => c + 1, 1.5);     // 1.51
```

### Lens

The part is always there: a key of a record, a field of an object.

```ts
import { Lens } from "@tinker/functional";

const name = Lens.of(
  (user: User) => user.name,
  (name: string, user: User) => (user.name === name ? user : { ...user, name }),
);
name.get(ada);                              // "Ada"
name.set("Eve", ada);                       // a new user named Eve
name.modify((n) => n.toUpperCase(), ada);   // a new user named ADA
```

### Optional

The part may be missing: an item of a list, a key that may be absent. `preview` says whether it is
there. `set` replaces the part when it is there, and returns the whole unchanged when it is not: it
never adds the part.

```ts
import { at, match } from "@tinker/functional";

const second = at<string>(1);
match(second.preview(["a", "b"]), { Some: (s) => s, None: () => "none" }); // "b"
match(second.preview(["a"]), { Some: (s) => s, None: () => "none" });      // "none"
second.set("c", ["a", "b"]);   // ["a", "c"]
second.set("c", ["a"]);        // ["a"]: no second item, nothing to replace
```

## Ready-made optics

| Optic | Kind | Reads |
|---|---|---|
| `prop<S>()(key)` | Lens | one key of a record |
| `at<T>(index)` | Optional | the item at a position of a list |
| `byKey(keyOf, key)` | Optional | the first item of a list whose key is `key` |

### `prop`

`prop` is curried: the first call takes the record type, and the second the key, which TypeScript
checks against that type.

```ts
const zip = prop<Address>()("zip");     // Lens<Address, string>
prop<Address>()("country");             // type error: not a key of Address
```

Its `set` copies the record with a spread, so the result is a plain object. Use it on records, not
on class instances.

### `at`

The item is missing when the index is not a whole number from 0 to the length less one, and when
the list has a hole there. A negative index does not count from the end.

```ts
at<string>(-1).preview(["a", "b"]);     // None
at<string>(0.5).preview(["a", "b"]);    // None
at<string | undefined>(0).preview([, "b"]); // None: a hole is missing, and set does not fill it
```

### `byKey`

`byKey` follows an item by its key, not by its position. When items are added, removed or moved, it
still reads the same item, and it reads nothing once the item is gone. Keys compare with `isEqual`.

```ts
import { byKey } from "@tinker/functional";

interface Line { readonly id: number; readonly qty: number }
const lines: readonly Line[] = [{ id: 1, qty: 1 }, { id: 2, qty: 5 }];

const line2 = byKey((line: Line) => line.id, 2);
line2.modify((line) => ({ ...line, qty: 6 }), lines);
// [{ id: 1, qty: 1 }, { id: 2, qty: 6 }]
line2.preview(lines.slice().reverse());   // still the line with id 2
line2.preview([lines[0]]);                // None: the line is gone
```

The item you set must keep its key. An item with another key is still written, and `byKey` then no
longer finds it.

## Composing

`compose(outer, inner)` reads `inner` inside the part that `outer` reads. The result is the weaker
kind of the two:

| `compose(outer, inner)` | inner: Iso | inner: Lens | inner: Optional |
|---|---|---|---|
| **outer: Iso** | Iso | Lens | Optional |
| **outer: Lens** | Lens | Lens | Optional |
| **outer: Optional** | Optional | Optional | Optional |

```ts
interface Order { readonly lines: readonly Line[] }

// Lens then Optional: an Optional
const qtyOfLine2 = compose(
  compose(prop<Order>()("lines"), byKey((line: Line) => line.id, 2)),
  prop<Line>()("qty"),
);
const order: Order = { lines };
qtyOfLine2.preview(order);      // Some(5)
qtyOfLine2.set(9, order);       // a new order, a new list, a new line 2; line 1 is shared
qtyOfLine2.set(9, { lines: [] }); // { lines: [] }, the same order: there is no line 2
```

Composing more than two optics is composing in steps, as above. `compose` is associative: the
grouping does not change the result.

Each kind can stand in for a weaker one: `toLens()` turns an Iso into a Lens, and `toOptional()`
turns any optic into an Optional. `compose` uses them itself, so you need them only for code that
takes one kind.

## The same whole when nothing changes

Every optic here follows one rule: setting the part to the value it already holds returns **the
same whole**, not a copy. Parts compare with `Object.is`.

```ts
city.set("Paris", ada) === ada;          // true
qtyOfLine2.set(5, order) === order;      // true, at any depth
```

This is what makes optics work with signals. A signal holding the whole compares the new value
with the old one by reference. When nothing changed, the whole is the same object, so the signal
sees no change and notifies no one. When one part changed, only the objects on the path to it are
new, so a reader of any other part still sees the same object.

## Writing your own optic

Build an optic from its functions with `Lens.of`, `Optional.of` or `Iso.of`. Follow the rule
above: return the whole itself when the part is unchanged, or, for an Optional, when the whole has
no part.

```ts
import { None, Optional, Some } from "@tinker/functional";

// The value under a key of a Map, which may be missing.
const entry = <K, V>(key: K) => Optional.of<ReadonlyMap<K, V>, V>(
  (map) => (map.has(key) ? Some.of(map.get(key) as V) : None.of<V>()),
  (value, map) => (!map.has(key) || Object.is(map.get(key), value)
    ? map
    : new Map(map).set(key, value)),
);
```

An Iso does not need the rule: as a Lens, it returns the same whole by itself when `to(whole)` is
already the part.

## Testing an optic against its laws

`@tinker/functional/testing` checks the laws of each kind, as it does for monads. Each checker
returns `[description, check]` pairs, and `check` throws when its law fails.

| Checker | Laws |
|---|---|
| `isoLaws` | `from(to(s))` is `s`; `to(from(a))` is `a` |
| `lensLaws` | get-set: `set(get(s), s)` is the same `s`; set-get: `get(set(a, s))` is `a`; set-set: `set(b, set(a, s))` is `set(b, s)` |
| `optionalLaws` | setting the part `s` holds is the same `s`; on an `s` with no part, `set(a, s)` is the same `s`; when `s` has a part, `preview(set(a, s))` is `Some(a)`; set-set |

"The same `s`" means the same object (`===`). Elsewhere the checkers compare with `equal`, which
defaults to `isEqual`: two objects are equal only when they are the same object. For records, pass
a structural equality:

```ts
import { isDeepStrictEqual } from "node:util";
import { test } from "vitest";
import { optionalLaws, EDGE_VALUES } from "@tinker/functional/testing";

const laws = optionalLaws({
  name: "entry(a)",
  optic: entry<string, unknown>("a"),
  samples: [new Map(), new Map([["a", 1]]), new Map([["b", 2]])], // with the part and without
  values: EDGE_VALUES,
  equal: isDeepStrictEqual,
});
for (const [description, check] of laws) {
  test(description, check);
}
```

For an Optional, give samples both with the part and without, or half of the laws check nothing.

## What optics do not do

- **No Prism or Traversal yet.** One case of a union, and every item of a list at once, have no
  optic. See [IMPROVEMENTS.md](../../../IMPROVEMENTS.md).
- **No signals.** Optics work on plain values. Applying one to a signal belongs to core.
- **No mutation.** An optic never changes the value it is given, so it works only on data treated
  as immutable.
- **No class instances in `prop`.** Its copy is a plain object, without the class's prototype.

# @tinker/functional

The functional library of Tinker: values that say in their type what may be missing, what may
fail, and what comes later, and optics to read and write a part of an immutable value. It has no
dependency, and the rest of Tinker is built on it.

```ts
import { fromNullable, map, match } from "@tinker/functional";

const name = map(fromNullable(users.get(id)), (user) => user.name);
match(name, { Some: (n) => `Hello ${n}`, None: () => "Who are you?" });
```

- [What is in it](#what-is-in-it)
- [Maybe and Either](#maybe-and-either)
- [Task, Stream and Emitter](#task-stream-and-emitter)
- [Function helpers](#function-helpers)
- [Optics](#optics)
- [Testing](#testing)
- [Known gaps](#known-gaps)

## What is in it

| Area | Exports | Source |
|---|---|---|
| A value that may be missing | `Maybe`: `Some`, `None`, `fromNullable`, `getOrElse`, `filter`, … | [`src/lib/monad/maybe.ts`](src/lib/monad/maybe.ts) |
| A value or a failure | `Either`: `Right`, `Left`, `attempt`, `mapLeft`, `valueOrThrow`, … | [`src/lib/monad/either.ts`](src/lib/monad/either.ts) |
| Reading a case | `match`, `use`, `isEqual` | [`src/lib/monad/monad.ts`](src/lib/monad/monad.ts) |
| Steps on any of them | `map`, `flatMap`, `sequence` | [`src/lib/functor/functor.ts`](src/lib/functor/functor.ts) |
| One value later | `Task`: `succeed`, `fail`, `fromPromise`, `delay`, `timeout`, `toPromise` | [`src/lib/stream/task.ts`](src/lib/stream/task.ts) |
| Many values later | `Stream`, `run`, `subscribe`, `Emitter`, `switchMap` | [`src/lib/stream/`](src/lib/stream/) |
| Plain functions | `pipe`, `flow`, `partial`, `memoise` | [`src/lib/function.ts`](src/lib/function.ts) |
| A part of a value | `Lens`, `Optional`, `Iso`, `compose`, `prop`, `at`, `byKey` | [`src/lib/optics/`](src/lib/optics/README.md) |
| Law checkers | `functorLaws`, `chainLaws`, `monadLaws`, `isoLaws`, `lensLaws`, `optionalLaws` | [`src/testing.ts`](src/testing.ts) |

The public API is [`src/index.ts`](src/index.ts), imported as `@tinker/functional`. The law
checkers are [`src/testing.ts`](src/testing.ts), imported as `@tinker/functional/testing`. Each
source file opens with a comment on what it is for and the rules it follows, and every export has
a doc comment with an example.

## Maybe and Either

A `Maybe<T>` is a `Some` holding a value, or a `None`. An `Either<T, E>` is a `Right` holding a
success, or a `Left` holding the other case, usually an error. Read either one only with `match`
(for a value) or `use` (for effects):

```ts
import { Left, match, Right, type Either } from "@tinker/functional";

const parseId = (text: string): Either<number, string> =>
  /^\d+$/.test(text) ? Right.of(Number(text)) : Left.of("not a number");

match(parseId("7"), { Right: (id) => `user ${id}`, Left: (why) => why }); // "user 7"
```

`map` and `flatMap` run their step on a `Some` or a `Right`, and skip a `None` or a `Left`, so a
pipeline reads as the success path. Lookups that may find nothing return a `Maybe`, and operations
that may fail return an `Either` (see `CONVENTIONS.md` at the root of the repository).

## Task, Stream and Emitter

A `Stream<T, R, E>` delivers items, then ends with an `Either<R, E>`. It is cold: nothing happens
until `run` or `subscribe`. A `Task<T, E>` is a stream with no items: one value later, or a
failure, which can be cancelled.

```ts
import { flatMap, fromPromise, run } from "@tinker/functional";

const cancel = run(
  flatMap(fromPromise((signal) => fetch(url, { signal })), (response) =>
    fromPromise(() => response.json())),
  { ok: render, error: showError },
);
```

An `Emitter` is the owner's side of a hot stream: the owner calls `emit`, and hands out only its
`stream`. `switchMap` runs a task for each item of a stream, and cancels the previous one.

## Function helpers

`pipe(value, f, g)` is `g(f(value))`, and `flow(f, g)` is the function doing it. `partial` fixes the
first arguments of a function. `memoise` keeps the last result of a pure function.

## Optics

An optic reads one part of an immutable value, and writes it back by returning a new value that
shares everything it did not touch. Setting a part to the value it already holds returns the same
value, so a signal holding it sees no change.

```ts
import { compose, prop } from "@tinker/functional";

const city = compose(prop<User>()("address"), prop<Address>()("city"));
city.get(user);           // "Paris"
city.set("Rome", user);   // a new user, with a new address
```

The kinds, the ready-made optics, composition, the laws and how to write your own optic are in
[src/lib/optics/README.md](src/lib/optics/README.md).

## Testing

`@tinker/functional/testing` checks the laws of a functor, a chain, a monad, an iso, a lens and an
optional. Each checker returns `[description, check]` pairs, so any test framework can run them:

```ts
import { test } from "vitest";
import { monadLaws } from "@tinker/functional/testing";

for (const [description, check] of monadLaws(myMonad)) {
  test(description, check);
}
```

`EDGE_VALUES` lists the values every law is checked on: zeros, `NaN`, empty strings, `null`,
`undefined`, empty and sparse arrays, maps, sets, symbols and functions.

## Known gaps

The open gaps of this package, and what would close each, are in [IMPROVEMENTS.md](IMPROVEMENTS.md).

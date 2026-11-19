# Resources

A resource is a value that a loader produces, with its state, its last error, and when it
last changed. Reading it never throws: a failure is data, not an exception.

```ts
const user = resource((signal) => fetch(`/users/${id()}`, { signal }).then((r) => r.json()), {
  default: emptyUser,
});
user.value();        // the default until the first success, then the last success
user.state();        // "idle" | "loading" | "fetched" | "failed" | "written"
user.error();        // the last failure, cleared by a success or a write
user.sourced();      // false while value is the default: no load or write has supplied it
user.lastUpdated();  // when value last changed, or undefined
user.set(value);     // write a value without loading it
user.reload();       // run the loader again
```

- **The loader** returns a promise or a `Task`. A `Task` can be composed with `map` and
  `flatMap`, and its cancellation runs when the run is superseded.
- **Its reads are tracked.** When a signal it read changes, the loader runs again, and the run
  in progress is aborted, so an older result cannot overwrite a newer one.
- **A failure** changes `error` and `state`, and `value` keeps the last success.
- **A write** with `set` replaces `value`, aborts the run in progress, and makes the state
  `"written"`.
- **A lazy resource** (`lazy: true`) is `"idle"` and runs its loader only on `reload()`.
- **A loader that returns `undefined`** skips the load: nothing runs, the value is kept, and the
  state is `"idle"`.
- **`sourced`** is the fact that a load or a write has supplied a value. `state` is the last
  thing that happened, so the two answer different questions.

`httpResource` is a resource whose loader is a request, in `@tinker/http`: see
[`http.md`](http.md).

## Mutations

A `mutation` is a write to the server: a call that changes data, not one that reads it.
It is not a resource: it is always ready, and each call is independent.

```ts
const save = mutation(
  (draft: Draft) => http.post("/todos", draft),
  { resource: todos, onSuccess: (current, created) => [...current, created] },
);

save.mutate(draft);  // starts a call; it does not wait
save.pending();      // how many calls are in flight
save.outcome();      // "none" | "succeeded" | "failed": the last call to finish
save.result();       // the last successful response, or undefined
save.error();        // the last failure, cleared by a success
save.reset();        // forget the outcome, result and error (not the calls in flight)
```

- **Calls run in parallel.** A call is not cancelled by another one. If a caller wants to
  prevent that, it checks `pending()` itself.
- **The outcome** is set by the last call to finish, whichever it was started by.
- **A failure** is a value: a mutator that throws synchronously, or rejects, sets `error`
  and `outcome` instead of throwing.
- **With `resource`**, a success updates it. With `onSuccess`, the resource takes
  `onSuccess(current, result)`; without it, the resource reloads from its loader.
  A failure leaves the resource alone.
- **The mutator** returns a promise or a `Task`, as a loader does. A mutator that returns
  `undefined` skips the call: nothing is pending, and the outcome is unchanged.

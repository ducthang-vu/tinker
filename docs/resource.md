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
- **`sourced`** is the fact that a load or a write has supplied a value. `state` is the last
  thing that happened, so the two answer different questions.

`httpResource` is a resource whose loader is a request, in `@tinker/http`: see
[`http.md`](http.md).

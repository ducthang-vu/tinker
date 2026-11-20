# The router's navigation pipeline

A navigation does not change the URL at once. It runs a pipeline first, and
only a navigation that passes it commits: the URL changes, the history entry
is added, and the activated routes are updated. A navigation that fails
leaves the URL, the history and the activated routes as they were.

## The steps

1. **Match.** The URL is matched against the route tree. No match fails with
   `NoRouteError`.
2. **Guards.** The `canActivate` guards of every matched route run, root
   first, each route's in order. Each guard returns a decision:
   - `true`: go on to the next guard.
   - `false`: the navigation fails with `NavigationRejectedError`.
   - a string: redirect to that URL. The redirect target is matched and
     guarded again from step 1, keeping the navigation's state. More than 10
     redirects fail the navigation with `NavigationFailedError`.
3. **Resolvers.** The `resolve` functions of the levels that are made again
   run, one after another, and their values go into `ActivatedRoute.data`.
   A level that stays (same route, params and segments) is not resolved again.
4. **Commit.** The URL and the activated routes change.

A guard or resolver runs in the router's injection context, so it can call
`inject`. It may return its value, or a `Task` of it for work that takes time.
A throw or a failing task fails the navigation with `NavigationFailedError`,
whose `cause` is the original error.

## Syntax

```ts
import { inject, Task } from "@tinker/core";
import { provideRouter, type Route } from "@tinker/router";

const ROOT: Route = {
  path: "",
  component: App,
  children: [
    { path: "/login", component: Login },
    {
      path: "/todos",
      component: Todos,
      canActivate: [
        () => (inject(Session).signedIn() ? true : "/login"),
      ],
      children: [
        {
          path: ":id",
          component: TodoDetail,
          resolve: {
            todo: (navigation) => Task.fromPromise(() => fetchTodo(navigation.match.params["id"] ?? "")),
          },
        },
      ],
    },
  ],
};
```

`navigate` returns a promise of the outcome:

```ts
const result = await router.navigate("/todos/7");
result.match({
  right: () => {},
  left: (error) => {
    if (error instanceof NavigationRejectedError) { /* a guard said no */ }
  },
});
```

The `Navigation` a guard or resolver receives has `url`, `state`, `match`
(the leaf route and its params) and `from` (the URL before the navigation).

## Cancelling and back/forward

- A new navigation cancels one still waiting for an asynchronous guard. The
  older one settles with `NavigationCancelledError` and changes nothing.
- Back and forward moves run the same checks, after the browser has moved. If
  one is rejected or fails, the router replaces the entry with the URL it was
  showing. A redirect replaces the entry with the target.

## What it does not do

- Guards run on every navigation whose URL matches their route, including a
  change only of the query or hash. There is no option to skip them.
- Resolvers of the root route do not run: the root is never made again. Put
  them on a child.
- Resolvers run one after another, not in parallel.
- Resolved data is typed `unknown`. Read it with a cast or a check.
- There is no deactivation guard (for example, to ask before leaving a form).
- Redirect targets must be absolute URLs, not relative to the route.

Known gaps and their planned fixes are listed in
[IMPROVEMENTS.md](../IMPROVEMENTS.md), under "Router".

# The router's navigation pipeline

A navigation does not change the URL at once. It runs a pipeline first, and
only a navigation that passes it commits: the URL changes, the history entry
is added, and the activated routes are updated. A navigation that fails
leaves the URL, the history and the activated routes as they were.

## The steps

1. **Match.** The URL is matched against the route tree. No match fails with
   `NoRouteError`.
2. **Redirect.** The `redirect` function of every matched route runs, root
   first. The first one that returns a URL decides: the navigation is sent to
   that URL, matched and checked again from step 1, keeping the navigation's
   state. A function returning `undefined` leaves the navigation alone.
3. **Guards.** The `canActivate` guards of every matched route run, root
   first, each route's in order. Each guard returns a decision:
   - `true`: go on to the next guard.
   - `false`: the navigation fails with `NavigationRejectedError`.
   - a string: redirect to that URL, as in step 2.
   More than 10 redirects, from either step, fail the navigation with
   `NavigationFailedError`.
4. **Commit.** The URL and the activated routes change. A level that stays
   (same route, params and segments) keeps its activated route.

A redirect and a guard run in the router's injection context, so they can call
`inject`. A redirect is synchronous. A guard may return its decision, or a
`Task` of it for work that takes time. A throw or a failing task fails the
navigation with `NavigationFailedError`, whose `cause` is the original error.

## Syntax

```ts
import { inject } from "@tinker/core";
import { type Route } from "@tinker/router";

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
      redirect: (navigation) => (navigation.url === "/todos" ? "/todos/1" : undefined),
      children: [
        { path: ":id", component: TodoDetail },
      ],
    },
  ],
};
```

`Route.data` holds static values, read from `ActivatedRoute.data` in the
component shown for the route.

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

The `Navigation` a guard receives has `url`, `state`, `match` (the leaf route
and its params) and `from` (the URL before the navigation).

## Cancelling and back/forward

- A new navigation cancels one still waiting for an asynchronous guard. The
  older one settles with `NavigationCancelledError` and changes nothing.
- Back and forward moves run the same checks, after the browser has moved. If
  one is rejected or fails, the router replaces the entry with the URL it was
  showing. A redirect replaces the entry with the target.

## What it does not do

- Guards run on every navigation whose URL matches their route, including a
  change only of the query or hash. There is no option to skip them.
- Route data cannot be computed from the navigation. Data is static.
- There is no deactivation guard (for example, to ask before leaving a form).
- Redirect targets must be absolute URLs, not relative to the route.

Known gaps and their planned fixes are listed in
[IMPROVEMENTS.md](../IMPROVEMENTS.md), under "Router".

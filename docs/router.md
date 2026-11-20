# The router's navigation pipeline

A navigation does not change the URL at once. It runs a sequence of steps
first, and only a navigation that passes them commits: the URL changes, the
history entry is added, and the activated routes are updated. A navigation
that fails leaves the URL, the history and the activated routes as they were.

Every step is dispatched as an **action** with a payload, so the whole
sequence is visible to anyone who subscribes to `router.actions`.

## The actions

A navigation dispatches these actions, in this order. Some are only dispatched
when they happen: a redirect, a guard, a browser change.

| Action | When | Payload |
|---|---|---|
| `NAVIGATION_START` | the navigation begins | `url`, `state`, `arrival` (`push` or `current`) |
| `MATCH_ROUTE` | the URL is matched against the route tree | `url` |
| `REDIRECT_ROUTE` | a route's `redirect`, or a guard, sends the navigation elsewhere | `url`, `target`, `by` (`route` or `guard`) |
| `GUARD_ROUTE` | the guards of one matched route run, root first | `url`, `route` (the path), `verdict` on success |
| `BROWSER_NAVIGATION` | the browser changes: `push`, `replace`, `none`, or `restore` | `url`, `state`, `step` |
| `NAVIGATION_END` | the navigation ends | `url` |

Every action has a `status`:

- **`success`**: the step did what it was for.
- **`error`**: the step failed. The action's `type` names the step that
  failed, its `payload` is what the step was given, and its `error` says why.

Every action of one navigation has the same `navigationId`, and `sequence`
numbers them from 1 in the order they happened. The first navigation is
number 1.

A typical push, with two matched routes, dispatches:

```
navigation 2: NAVIGATION_START   sequence 1  success
navigation 2: MATCH_ROUTE        sequence 2  success
navigation 2: GUARD_ROUTE        sequence 3  success   (root)
navigation 2: GUARD_ROUTE        sequence 4  success   (todos)
navigation 2: BROWSER_NAVIGATION sequence 5  success   step: push
navigation 2: NAVIGATION_END     sequence 6  success
```

A guard that rejects a route dispatches that route's `GUARD_ROUTE` with
status `error` (its error is a `NavigationRejectedError`), then
`NAVIGATION_END` with status `error`. The routes after it do not run, and the
browser is not changed.

Subscribing:

```ts
router.actions.run({
  next: (action) => {
    console.log(action.navigationId, action.sequence, action.type, action.status);
  },
});
```

Subscribers see the actions from the moment they subscribe. The router's first
navigation runs when it is created, so a subscriber made afterwards does not
see it.

## The steps

1. **Match.** The URL is matched against the route tree. No match fails
   `MATCH_ROUTE` with `NoRouteError`.
2. **Redirect.** The `redirect` function of every matched route runs, root
   first. The first one that returns a URL decides: the navigation goes to that
   URL and steps 1 and 2 run again for it. A function returning `undefined`
   leaves the navigation alone.
3. **Guards.** The `canActivate` guards of every matched route run, root first,
   one `GUARD_ROUTE` per route. Each guard returns a decision:
   - `true`: go on to the next guard.
   - `false`: the route's `GUARD_ROUTE` fails with `NavigationRejectedError`.
   - a string: redirect to that URL, as in step 2 (`REDIRECT_ROUTE` with `by`
     set to `guard`).
   More than 10 redirects, from either step, fail the navigation with
   `NavigationFailedError`, on the `REDIRECT_ROUTE` that would be the eleventh.
4. **Browser.** The history entry is pushed (`push`), or the current one is
   replaced when a back or forward move was redirected (`replace`), or left
   alone (`none`). The activated routes then update. If the browser refuses,
   the action fails.
5. **End.** `NAVIGATION_END`: success when the URL committed, or the error that
   stopped it.

Redirects and guards run in the router's injection context, so they can call
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

The `Navigation` a guard or redirect receives has `url`, `state`, `match` (the
leaf route and its params) and `from` (the URL before the navigation).

## Cancelling and back/forward

- A new navigation cancels one still waiting for an asynchronous guard. The
  older one dispatches `NAVIGATION_END` with `NavigationCancelledError`, and
  changes nothing.
- Back and forward moves run the same steps, after the browser has moved. If
  one is rejected or fails, the router replaces the entry with the URL it was
  showing: a `BROWSER_NAVIGATION` with step `restore`. A redirect replaces the
  entry with the target.

## What it does not do

- Guards run on every navigation whose URL matches their route, including a
  change only of the query or hash. There is no option to skip them.
- Route data cannot be computed from the navigation. Data is static.
- Redirect targets must be absolute URLs, not relative to the route.
- The first navigation, made when the router is created, is not seen by a
  subscriber made afterwards.

Known gaps and their planned fixes are listed in
[IMPROVEMENTS.md](../IMPROVEMENTS.md), under "Router".

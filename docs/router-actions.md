# Navigation actions

Each step of a navigation is an **action** with a payload. Subscribers can
follow a navigation from start to end by reading the actions in order. This
page defines the actions and how they relate. The module is
`packages/router/src/actions.ts`.

## The actions and their order

A navigation dispatches these actions in this order. An action marked "when"
is dispatched only in that case.

| Action | Dispatched | Payload |
|---|---|---|
| `NAVIGATION_START` | always, first | `url`, `state`, `arrival` (`push` or `current`) |
| `MATCH_ROUTE` | after the start, and again after each redirect | `url` |
| `REDIRECT_ROUTE` | when a route or a guard sends the navigation elsewhere | `url`, `target`, `by` (`route` or `guard`) |
| `GUARD_ROUTE` | once per matched route, root first, before any browser change | `url`, `route` (the path), `verdict` on success |
| `BROWSER_NAVIGATION` | when the browser changes: `push`, `replace`, `none`, or `restore` | `url`, `state`, `step` |
| `NAVIGATION_END` | always, last | `url` |

The relations between them:

- `MATCH_ROUTE` comes before any `GUARD_ROUTE`. Guards run only for a URL that
  matched.
- A `REDIRECT_ROUTE` is followed by a new `MATCH_ROUTE` for its `target`. The
  guards of the first URL do not run for it.
- A `GUARD_ROUTE` that decides `true` lets the next route's guards run. One
  that decides a URL is followed by a `REDIRECT_ROUTE` with `by: "guard"`.
- `BROWSER_NAVIGATION` comes after every `GUARD_ROUTE` of a navigation that
  passes. A failed navigation changes the browser only when it is a back or
  forward move that must be put back, and then the action has step `restore`.
- `NAVIGATION_END` is the last action of every navigation, and there is exactly
  one.

A typical push with two matched routes:

```
navigation 2: NAVIGATION_START    sequence 1  success
navigation 2: MATCH_ROUTE         sequence 2  success
navigation 2: GUARD_ROUTE         sequence 3  success   route: "/"
navigation 2: GUARD_ROUTE         sequence 4  success   route: "/todos"
navigation 2: BROWSER_NAVIGATION  sequence 5  success   step: push
navigation 2: NAVIGATION_END      sequence 6  success
```

A guard that rejects `/todos` changes the last three lines:

```
navigation 2: GUARD_ROUTE         sequence 4  error     route: "/todos"
navigation 2: NAVIGATION_END      sequence 5  error
```

## Numbering

Every action of one navigation has the same `navigationId`, and its
`sequence` counts from 1 in the order the actions were dispatched. A new
navigation gets the next id, so the ids are unique within a router. A
navigation that is cancelled still ends with a `NAVIGATION_END`, so every id
has one.

## Status and errors

Every action has a `status`:

- `success`: the step did what it was for. The payload says what it decided.
  A `GUARD_ROUTE` success has `verdict`: `true`, or the URL it redirects to.
- `error`: the step failed. The action's `type` names the step that failed,
  its `payload` is what the step was given, and its `error` says why.

Errors are dispatched as the action that failed, not as a separate action:

| Failure | Dispatched as |
|---|---|
| No route matches the URL | `MATCH_ROUTE`, error `NoRouteError` |
| A guard says `false` | `GUARD_ROUTE`, error `NavigationRejectedError` |
| A guard or redirect throws, or its task fails | the `GUARD_ROUTE` or `REDIRECT_ROUTE` that ran it, error `NavigationFailedError` |
| Redirects never end | `REDIRECT_ROUTE`, error `NavigationFailedError` |
| The browser refuses a change | `BROWSER_NAVIGATION`, with the browser's error |
| A newer navigation replaces this one | `NAVIGATION_END`, error `NavigationCancelledError` |

After a failed action, the navigation dispatches nothing else except the
`BROWSER_NAVIGATION` restore, if it applies, and then `NAVIGATION_END` with
status `error`.

## Using the module

A router creates one `NavigationTrace` per navigation with a fresh id, and
calls it at each step:

```ts
const trace = NavigationTrace.of(id, dispatch);
trace.success("NAVIGATION_START", { url, state, arrival: "push" });

// A step that is a Task: dispatched when it settles, and its outcome passed on.
const matched = trace.observe("MATCH_ROUTE", { url }, matchTask);
```

`observe` covers the common case of a step that is a `Task`. Use `success` and
`failure` directly for a step that is synchronous or decided by the caller.

## What this module does not do

- It does not run navigations, match routes, or change the browser. It only
  numbers and dispatches the actions the caller reports.
- It does not replay past actions. A subscriber sees the actions dispatched
  after it subscribes.

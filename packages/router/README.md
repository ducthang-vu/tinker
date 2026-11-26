# @tinker/router

The router of Tinker: the routes of the app, the URL they match, the components
shown for it, and the navigation between them. It is built on the same signals,
dependency injection and components as the rest of Tinker.

- [Setting up](#setting-up)
- [Routes](#routes)
- [Showing the routes](#showing-the-routes)
- [Links and navigation](#links-and-navigation)
- [Building paths](#building-paths)
- [Guards and redirects](#guards-and-redirects)
- [Lazy routes](#lazy-routes)
- [Navigation events](#navigation-events)
- [The browser location](#the-browser-location)
- [What it does not do](#what-it-does-not-do)

## Setting up

Give the top-level routes to `provideRouter`, and pass the result to `bootstrap`:

```ts
import { bootstrap } from "@tinker/core";
import { provideRouter } from "@tinker/router";
import { App } from "./app.ts";
import { ROUTES } from "./routes.ts";

bootstrap(App, { providers: provideRouter(ROUTES) });
```

The root of the route tree is never shown. Its children are the routes you pass.

## Routes

A `Route` is a plain object:

```ts
const ROUTES: readonly Route[] = [
  { path: "", component: Home },
  {
    path: "todos",
    component: TodosShell,
    children: [
      { path: "", component: TodoList },
      { path: ":id", component: TodoDetail },
    ],
  },
  { path: "**", component: NotFound },
];
```

- `path` is one segment of the URL. `""` takes no segment, so the route shows
  for its parent's URL. `:name` is a param, which takes any one segment and
  puts its value in `params`. `**` takes the rest of the URL, and matches any
  URL, so declare it last.
- `component` is the component shown when the route matches. A route with no
  component shows nothing of its own, and the outlet shows the first route
  below it that has one. This lets a group of routes share a parent.
- `children` are matched against the segments the path leaves over, in order.
  The first child that matches wins. A route without children must match the
  whole URL.
- `data` is static data of the route, read from the `ActivatedRoute` of the
  component it shows (`inject(ActivatedRoute).route.data`).
- `redirect`, `canMatch`, `canActivate`, `canDeactivate` and `loadChildren` are
  described below.

## Showing the routes

Put a `RouterOutlet` where the routed component should appear:

```ts
@Component({
  selector: "app-shell",
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class App {}
```

A component shown by an outlet can read its own route. `ActivatedRoute` holds
its `params`, its `segments`, its `route` and its `parent`:

```ts
@Component({ selector: "todo-detail", template: `<p>Todo {{ id }}</p>` })
export class TodoDetail {
  readonly id = inject(ActivatedRoute).params["id"];
}
```

The router's own state is on `Router`:

- `url`: the current URL, as a signal.
- `match`: the leaf route and the params of every level, as a signal, or
  `undefined` when no route is active. It is set when a navigation commits.
- `activated`: the activated routes, root first.
- `routes`: the route tree the router was given.

## Links and navigation

`RouterLink` is a directive for anchors. Its inputs:

| Input | Meaning |
| --- | --- |
| `routerlink` | The destination: a URL string, or an array of segments. |
| `target` | `_self`, or none, navigates in this tab. Any other target, such as `_blank`, is left to the browser, and the router does not navigate. |
| `queryParams` | The query of the destination. |
| `preserveQueryParams` | Keeps the query of the current URL: `"none"` (the default), `"all"`, or the names to keep. |
| `fragment` | The hash of the destination, without `#`. |
| `state` | The history state of the new entry. |

```html
<a routerlink="/todos/7" [queryParams]="{ tab: 'done' }">Todo 7</a>
```

To navigate from code, inject the router and build the destination with an
`AppPathBuilder`. A component lists the builder in its `providers`:

```ts
@Component({
  selector: "todo-list",
  providers: [AppPathBuilder],
  template: `<button (click)="open(7)">Open 7</button>`,
})
export class TodoList {
  private readonly router = inject(Router);
  private readonly builder = inject(AppPathBuilder);

  open(id: number): void {
    void this.router.navigate(this.builder.to("todos", String(id)).build());
  }
}
```

`navigate` returns a promise of the outcome. Its `kind` is:

- `done`: the navigation committed.
- `cancelled`: a newer navigation replaced it before it committed.
- `rejected`, with a `reason`:
  - `no-route`: no route takes the path.
  - `guard`: a guard stopped it. The `guard` field holds the stop command and
    `route` names the route that stopped it.
  - `failed`: a step threw. The `cause` field holds the error.

A rejected or cancelled navigation changes nothing. Back and forward moves go
through the same guards. A rejected back or forward move puts the browser back
on the last committed URL.

## Building paths

`AppPathBuilder` builds an `AppPath`, the only value `navigate` takes. Each
step checks the segments against the route tree, so a path that no route takes
cannot be made by mistake:

- `to(...segments)`: adds segments. One string is split on `/`.
- `parse(url)`: reads a URL. A leading `/` starts at the root. Without it, the
  URL continues from the current position.
- `up()`: goes back to the parent route.
- `relativeTo(route?)`: starts from a route. Without an argument, it starts at
  the route of the component the builder is in. A builder injected at the root
  starts at the root.
- `withQuery(record)`, `withFragment(value)`: add the query and the hash. Both
  come after the path.
- `build()`: returns the `AppPath`. It throws a `ParseError` when no route takes
  the whole path.

A `ParseError` has a `reason` (`no-route` or `malformed`), the input, and the
part that failed.

## Guards and redirects

A guard decides whether a navigation may go on. It returns a task of a command,
built with the helpers of `@tinker/functional`:

```ts
import { succeed } from "@tinker/functional";
import {
  AllowCommand,
  RedirectCommand,
  RedirectPayload,
  StopCommand,
  StopPayload,
} from "@tinker/router";

const signedIn: Guard = () =>
  succeed(isSignedIn() ? new AllowCommand() : new StopCommand(new StopPayload("sign in first")));
```

- `AllowCommand`: the navigation goes on.
- `StopCommand(new StopPayload(reason?))`: the navigation is rejected with reason `guard`.
- `RedirectCommand(new RedirectPayload(path, reason?))`: the navigation goes to
  another `AppPath` instead.

A guard that waits returns a task that succeeds later. Use `fromPromise` for a
promise.

The guards on a route run in this order, for each navigation:

1. `canMatch` gates, while the URL is matched. See [Lazy routes](#lazy-routes).
2. `redirect`: a function of the matched request that returns an `AppPath`, or
   `undefined` to leave the navigation alone.
3. `canDeactivate` guards of the routes being left, from the last to the first.
   Each receives the request and the route it leaves.
4. `canActivate` guards of the matched routes, root first.

Then the navigation commits.

## Lazy routes

A route can load its children when a navigation first reaches it:

```ts
{
  path: "api",
  component: ApiShell,
  canMatch: [signedInOnly],
  loadChildren: (signal) =>
    import("./api-routes.ts").then((module) => module.API_CHILDREN),
}
```

- `loadChildren` runs once per route, the first time a navigation reaches it.
  The loaded children are kept with the route, so later navigations use them.
- A load that is still running is shared by the navigations that wait for it.
- The loader receives a signal. It is aborted when the navigations waiting for
  the load have all been superseded, so the download can stop.
- A failed load is not kept, so a later navigation tries again.
- `canMatch` runs before the load. A `STOP` skips the route, so its children
  are not downloaded. A `REDIRECT` sends the navigation elsewhere.
- The route with `loadChildren` shows its own component, if it has one, and the
  loaded children are shown below it. A route that only groups children can
  have no component.

A URL under a lazy route whose children are not loaded yet is accepted by
`AppPathBuilder` and `parse`. The navigation that loads the children checks it,
so a wrong segment is reported by the navigation, not when the path is built.

## Navigation events

`Router.events` is a stream of the navigations. Each navigation publishes
`STARTED` when it begins, then one final event for its outcome: `DONE`,
`CANCELLED`, or `REJECTED`. Each event is an object of the form
`{ type, payload }`. The types are `NavigationStarted`, `NavigationDone`,
`NavigationCancelled` and `NavigationRejected`, and `NavigationEvent` is their
union.

## The browser location

The router reads and writes the browser through `Location`. The app is served
under the folder named by the page's `<base>` element, so routes do not contain
it. `PLATFORM_LOCATION` is the browser's location, and tests provide their own
to replace it.

## What it does not do

- Routes are fixed when the app starts. `Router.routes` never changes.
- There are no resolvers: data is not loaded before a route is shown.
- Lazy routes have no preloading and no retry policy. A failed load is retried
  only by the next navigation to it.
- A superseded navigation is cancelled, but a loader that ignores its signal
  keeps downloading.
- The trace of a navigation (`meta`) is `unknown[]`. It is for debugging, and
  the app does not act on it.
- `canMatch` skips a route, it does not reject the navigation. A navigation no
  route takes is `no-route`.

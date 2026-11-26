import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Location } from "../location/location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "../location/platform-location.ts";
import { Router } from "./router.ts";
import type { PageRoute, Route } from "./route.ts";
import { ParseError, AppPathBuilder } from "../destination/app-path-builder.ts";
import { makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";
import {
  AllowCommand,
  type DeactivateGuard,
  type Guard,
  RedirectCommand,
  RedirectPayload,
  type RouteGuardCommand,
  StopCommand,
  StopPayload,
} from "../pipeline/guard-step.ts";
import { succeed } from "@tinker/functional";
import { MAX_REDIRECTS } from "../pipeline/match-step.ts";
import { fromComputation, getOrThrow, isNone, run } from "@tinker/functional";
import type { NavigationEvent } from "./navigation-event.ts";

/** A platform location that starts at `url`, and records the entries the router adds. */
function fakePlatform(url: string) {
  let current = { url, state: null as unknown };
  const platform: PlatformLocation = {
    url: () => current.url,
    state: () => current.state,
    push: (next, state) => {
      current = { url: next, state };
    },
    replace: (next, state) => {
      current = { url: next, state };
    },
    onPop: () => () => {},
  };
  return { platform, state: () => current.state };
}

class Root {}
class TodoList {}
class TodoDetail {}
class TodoShell {}

/** The routes of the todos: the list at `/todos`, and the detail at `/todos/:id`, under a shell. */
const LIST: PageRoute = { path: "", component: TodoList };
const DETAIL: PageRoute = { path: ":id", component: TodoDetail };
const TODOS: PageRoute = { path: "todos", component: TodoShell, children: [LIST, DETAIL] };
const CHILDREN: readonly Route[] = [TODOS];
const ROOT: Route = { path: "", component: Root, children: CHILDREN };

/** A router over `root`, and its injected builder, in a fake platform that starts at `url`. */
function routerOver(root: Route, url: string) {
  const fake = fakePlatform(url);
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
      provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
      provide(AppPathBuilder, { useClass: AppPathBuilder }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const urls = runInInjectionContext(injector, () => inject(AppPathBuilder));
  return { router, urls, fake, destroy };
}

/** A router over ROOT, in the context of a fake platform that starts at `url`. */
function routerAt(url: string) {
  return routerOver(ROOT, url);
}

test("the URL is a signal of the current location", () => {
  const { router, urls } = routerAt("/todos");
  expect(router.url())
    .toBe("/todos");
});

test("the match is the route and params of the current URL", () => {
  const { router, urls } = routerAt("/todos/7");
  expect(router.match()?.route.component)
    .toBe(TodoDetail);
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate changes the URL and the match", async () => {
  const { router, urls } = routerAt("/todos");
  await router.navigate(urls.parse("/todos/7")
    .build());
  expect(router.url())
    .toBe("/todos/7");
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate with a state gives the state to the history entry", async () => {
  const { router, urls, fake } = routerAt("/todos");
  await router.navigate(urls.parse("/todos/7")
    .build(), { state: { scroll: 320 } });
  expect(fake.state())
    .toEqual({ scroll: 320 });
});

test("a URL no route matches is rejected with the no-route reason, and the URL does not change", async () => {
  const { router, fake } = routerAt("/todos");
  const elsewhere = builderOver([{ path: "nowhere", component: Root }])
    .to("nowhere")
    .build();
  const outcome = await router.navigate(elsewhere, { state: { scroll: 1 } });
  expect(outcome)
    .toMatchObject({ kind: "rejected", reason: "no-route" });
  expect(router.url())
    .toBe("/todos");
  expect(fake.state())
    .toBeNull();
});

test("a navigation to a matched URL resolves done once it commits", async () => {
  const { router, urls } = routerAt("/todos");
  expect(await router.navigate(urls.parse("/todos/7")
    .build()))
    .toMatchObject({ kind: "done" });
});

test("a ** route catches the URLs no other route matches", async () => {
  const NotFound = class {};
  const tree: Route = {
    path: "",
    component: Root,
    children: [TODOS, { path: "**", component: NotFound }],
  };
  const { router, urls, destroy } = routerOver(tree, "/todos");
  await router.navigate(urls.parse("/nowhere")
    .build());
  expect(router.match()?.route.component)
    .toBe(NotFound);
  destroy();
});

test("activated starts with the root, then one entry per matched level", () => {
  const { router, urls, destroy } = routerAt("/todos/7");
  const [first, second, third] = router.activated();
  expect(first?.route)
    .toBe(ROOT);
  expect(second?.route)
    .toBe(TODOS);
  expect(third?.route)
    .toBe(DETAIL);
  expect(third?.params)
    .toEqual({ id: "7" });
  expect(third?.segments)
    .toEqual(["7"]);
  expect(router.activated())
    .toHaveLength(3);
  destroy();
});

test("the root activated route is the same instance across navigations", async () => {
  const { router, urls, destroy } = routerAt("/todos");
  const before = router.activated()[0];
  await router.navigate(urls.parse("/todos/7")
    .build());
  expect(router.activated()[0])
    .toBe(before);
  destroy();
});

test("with no match, the activated routes are the root alone", () => {
  const { router, urls, destroy } = routerAt("/nowhere");
  expect(router.activated())
    .toHaveLength(1);
  expect(router.activated()[0]?.route)
    .toBe(ROOT);
  destroy();
});

test("a level keeps its instance when only the query changes", async () => {
  const { router, urls, destroy } = routerAt("/todos/7");
  const before = router.activated()[2];
  await router.navigate(urls.parse("/todos/7?tab=done")
    .build());
  expect(router.activated()[2])
    .toBe(before);
  destroy();
});

test("a level is made again when its params change, and the levels above it stay", async () => {
  const { router, urls, destroy } = routerAt("/todos/7");
  const root = router.activated()[0];
  const shell = router.activated()[1];
  const before = router.activated()[2];
  await router.navigate(urls.parse("/todos/8")
    .build());
  expect(router.activated()[2])
    .not.toBe(before);
  expect(router.activated()[1])
    .toBe(shell);
  expect(router.activated()[0])
    .toBe(root);
  destroy();
});

test("a ** level is made again when its segments change", async () => {
  const notFound = { path: "**", component: class {} };
  const { router, urls, destroy } = routerOver({ path: "", component: Root, children: [notFound] }, "/anything/a");
  const before = router.activated()[1];
  await router.navigate(urls.parse("/anything/b")
    .build());
  expect(router.activated()[1])
    .not.toBe(before);
  destroy();
});

/** A tree of orgs and teams: `/orgs/:org/teams/:team`, one segment per level. */
const TEAM: Route = { path: ":team", component: class {} };
const TEAMS: Route = { path: "teams", children: [TEAM] };
const ORG: Route = { path: ":org", component: class {}, children: [TEAMS] };
const ORGS: Route = { path: "orgs", children: [ORG] };
const ORG_ROOT: Route = { path: "", component: Root, children: [ORGS] };

test("a level under a changed parent is made again, though its own params are the same", async () => {
  const { router, urls, destroy } = routerOver(ORG_ROOT, "/orgs/acme/teams/x");
  const before = router.activated()[4];
  await router.navigate(urls.parse("/orgs/beta/teams/x")
    .build());
  expect(router.activated()[4])
    .not.toBe(before);
  expect(router.activated()[4]?.route)
    .toBe(TEAM);
  destroy();
});

test("the root has no parent, and each level's parent is the level above it", () => {
  const { router, urls, destroy } = routerAt("/todos/7");
  const [root, shell, leaf] = router.activated() as [
    ActivatedRoute,
    ActivatedRoute,
    ActivatedRoute,
  ];
  expect(isNone(root.parent))
    .toBe(true);
  expect(getOrThrow(shell.parent, () => new Error("no parent")))
    .toBe(root);
  expect(getOrThrow(leaf.parent, () => new Error("no parent")))
    .toBe(shell);
  destroy();
});

test("a deeper level's parent chain reaches the root", () => {
  const { router, urls, destroy } = routerOver(ORG_ROOT, "/orgs/acme/teams/x");
  const levels = router.activated();
  expect(levels)
    .toHaveLength(5);
  for (const [index, level] of levels.entries()) {
    if (index > 0) {
      expect(getOrThrow(level.parent, () => new Error("no parent")))
        .toBe(levels[index - 1]);
    }
  }
  destroy();
});

test("a kept level keeps its parent, and a made level gets the kept one as its parent", async () => {
  const { router, urls, destroy } = routerAt("/todos/7");
  const shell = router.activated()[1];
  const leafBefore = router.activated()[2];
  await router.navigate(urls.parse("/todos/7?tab=done")
    .build());
  expect(getOrThrow(router.activated()[2]!.parent, () => new Error("no parent")))
    .toBe(shell);
  await router.navigate(urls.parse("/todos/8")
    .build());
  expect(getOrThrow(router.activated()[2]!.parent, () => new Error("no parent")))
    .toBe(shell);
  expect(router.activated()[2])
    .not.toBe(leafBefore);
  destroy();
});

test("parse throws a ParseError for a URL no route matches", () => {
  const { router, urls } = routerAt("/todos");
  expect(() => urls.parse("/nowhere")
    .build())
    .toThrow(ParseError);
});

/** A router over the todos tree whose `:id` route runs `guards`, starting at `url`. */
function routerWithGuard(guards: readonly Guard[], url = "/todos") {
  const guarded: Route = {
    ...TODOS,
    children: [LIST, { ...DETAIL, canActivate: guards }],
  };
  return routerOver({ path: "", component: Root, children: [guarded] }, url);
}

test("a guard that says no stops the navigation, naming the route whose guard said it", async () => {
  const deny: Guard = () => succeed(new StopCommand(new StopPayload("not allowed")));
  const { router, urls, destroy } = routerWithGuard([deny]);
  expect(await router.navigate(urls.parse("/todos/7")
    .build()))
    .toMatchObject({ kind: "rejected", reason: "guard", route: ":id" });
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a guard that redirects sends the navigation to its target instead, which is done", async () => {
  const toList: Guard = () => succeed(new RedirectCommand(new RedirectPayload(builderOver(CHILDREN)
    .to("todos")
    .build())));
  const { router, urls, destroy } = routerWithGuard([toList]);
  expect(await router.navigate(urls.parse("/todos/7")
    .build()))
    .toMatchObject({ kind: "done" });
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a route that redirects to itself is rejected as failed, with the redirect cap as the cause", async () => {
  const loop: Route = {
    path: "",
    component: Root,
    children: [{ path: "todos", redirect: () => builderOver(CHILDREN)
      .to("todos")
      .build() }],
  };
  const { router, urls, destroy } = routerOver(loop, "/");
  expect(MAX_REDIRECTS)
    .toBe(10);
  const outcome = await router.navigate(urls.parse("/todos")
    .build());
  expect(outcome)
    .toMatchObject({ kind: "rejected", reason: "failed" });
  expect(router.url())
    .toBe("/");
  destroy();
});

test("a navigation replaced by a newer one is cancelled, and the newer one is done", async () => {
  let release: ((value: RouteGuardCommand) => void) | undefined;
  const slow: Guard = () => fromComputation<RouteGuardCommand, unknown>((ok) => {
    release = ok;
    return () => {};
  });
  const { router, urls, destroy } = routerWithGuard([slow], "/todos");
  const first = router.navigate(urls.parse("/todos/7")
    .build());
  const second = router.navigate(urls.parse("/todos")
    .build());
  expect(await second)
    .toMatchObject({ kind: "done" });
  release?.(new AllowCommand());
  expect(await first)
    .toMatchObject({ kind: "cancelled" });
  expect(router.url())
    .toBe("/todos");
  destroy();
});

/** A platform that records its pop listeners, so a test can move the browser back or forward. */
function poppableRouter(root: Route, url: string) {
  let current = { url, state: null as unknown };
  const listeners = new Set<() => void>();
  const platform: PlatformLocation = {
    url: () => current.url,
    state: () => current.state,
    push: (next, state) => {
      current = { url: next, state };
    },
    replace: (next, state) => {
      current = { url: next, state };
    },
    onPop: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
      provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
      provide(AppPathBuilder, { useClass: AppPathBuilder }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const urls = runInInjectionContext(injector, () => inject(AppPathBuilder));
  /** The browser moves to `next`, as a back or forward move does, and the router hears of it. */
  const move = (next: string, state: unknown = null) => {
    current = { url: next, state };
    for (const listener of listeners) {
      listener();
    }
  };
  return { router, urls, move, current: () => current, destroy };
}

test("a back move through the guards commits, and the routes follow it", () => {
  const { router, move, destroy } = poppableRouter(ROOT, "/todos/7");
  move("/todos");
  expect(router.url())
    .toBe("/todos");
  expect(router.activated()[1]?.route)
    .toBe(TODOS);
  destroy();
});

test("a back move a guard rejects is restored: the browser returns to the last committed URL and state", async () => {
  const deny: Guard = () => succeed(new StopCommand(new StopPayload("not allowed")));
  const guarded: Route = {
    path: "",
    component: Root,
    children: [{ ...TODOS, children: [LIST, { ...DETAIL, canActivate: [deny] }] }],
  };
  const { router, urls, move, current, destroy } = poppableRouter(guarded, "/todos");
  await router.navigate(urls.parse("/todos")
    .build());
  move("/todos/7", { scroll: 3 });
  expect(current())
    .toEqual({ url: "/todos", state: null });
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a back move a guard redirects goes to the redirect target, which replaces the entry", () => {
  const toList: Guard = () => succeed(new RedirectCommand(new RedirectPayload(builderOver(CHILDREN)
    .to("todos")
    .build())));
  const guarded: Route = {
    path: "",
    component: Root,
    children: [{ ...TODOS, children: [LIST, { ...DETAIL, canActivate: [toList] }] }],
  };
  const { router, move, current, destroy } = poppableRouter(guarded, "/todos");
  move("/todos/7");
  expect(current().url)
    .toBe("/todos");
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a back move to a URL no route takes is restored at once", () => {
  const { router, move, current, destroy } = poppableRouter(ROOT, "/todos");
  move("/nowhere");
  expect(current().url)
    .toBe("/todos");
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("the outcome carries the trace of its navigation, for debugging", async () => {
  const allowGuard: Guard = () => succeed(new AllowCommand());
  const { router, urls, destroy } = routerWithGuard([allowGuard]);
  expect(await router.navigate(urls.parse("/todos/7")
    .build()))
    .toMatchObject({ kind: "done", meta: [{ step: "guard", route: ":id", command: "ALLOW" }] });
  destroy();
});

test("a deactivate guard that stops keeps the user on the route they leave", async () => {
  const stay: DeactivateGuard = () => succeed(new StopCommand(new StopPayload("unsaved changes")));
  const guarded: Route = {
    path: "",
    component: Root,
    children: [{ ...TODOS, children: [LIST, { ...DETAIL, canDeactivate: [stay] }] }],
  };
  const { router, urls, destroy } = routerOver(guarded, "/todos/7");
  expect(await router.navigate(urls.parse("/todos")
    .build()))
    .toMatchObject({ kind: "rejected", reason: "guard", guard: { payload: { reason: "unsaved changes" } } });
  expect(router.url())
    .toBe("/todos/7");
  destroy();
});

test("the router publishes STARTED, then one final event for the outcome, for each navigation", async () => {
  const { router, urls, destroy } = routerAt("/todos");
  const seen: NavigationEvent[] = [];
  const stop = run(router.events, { next: (event) => {
    seen.push(event);
  } });
  const outcome = await router.navigate(urls.parse("/todos/7")
    .build());
  expect(seen.map((event) => event.type))
    .toEqual(["STARTED", "DONE"]);
  expect(seen.map((event) => event.source))
    .toEqual(["START", "COMMIT"]);
  expect(seen[1])
    .toEqual({ type: "DONE", source: "COMMIT", payload: outcome });
  stop();
  destroy();
});

test("a navigation no route takes is rejected, with the match step as its source", async () => {
  const { router, destroy } = routerAt("/todos");
  const seen: NavigationEvent[] = [];
  const stop = run(router.events, { next: (event) => {
    seen.push(event);
  } });
  const outcome = await router.navigate(makeAppPath([{ kind: "segment", value: "nowhere" }], {}, undefined));
  expect(outcome)
    .toMatchObject({ kind: "rejected", reason: "no-route", source: "MATCH" });
  expect(seen.at(-1))
    .toMatchObject({ type: "REJECTED", source: "MATCH" });
  stop();
  destroy();
});

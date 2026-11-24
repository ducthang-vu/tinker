import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Location } from "../location/location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "../location/platform-location.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";
import { ParseError, UrlBuilder } from "../destination/url-builder.ts";
import type { Guard } from "../pipeline/guard-step.ts";
import { MAX_REDIRECTS } from "../pipeline/match-step.ts";
import { fromComputation, getOrThrow, isNone } from "@tinker/functional";

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
const LIST: Route = { path: "", component: TodoList };
const DETAIL: Route = { path: ":id", component: TodoDetail };
const TODOS: Route = { path: "todos", component: TodoShell, children: [LIST, DETAIL] };
const CHILDREN: readonly Route[] = [TODOS];
const ROOT: Route = { path: "", component: Root, children: CHILDREN };

/** A router over `root`, in the context of a fake platform that starts at `url`. */
function routerOver(root: Route, url: string) {
  const fake = fakePlatform(url);
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  return { router, fake, destroy };
}

/** A router over ROOT, in the context of a fake platform that starts at `url`. */
function routerAt(url: string) {
  return routerOver(ROOT, url);
}

test("the URL is a signal of the current location", () => {
  const { router } = routerAt("/todos");
  expect(router.url())
    .toBe("/todos");
});

test("the match is the route and params of the current URL", () => {
  const { router } = routerAt("/todos/7");
  expect(router.match()?.route.component)
    .toBe(TodoDetail);
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate changes the URL and the match", async () => {
  const { router } = routerAt("/todos");
  await router.navigate(router.parse("/todos/7"));
  expect(router.url())
    .toBe("/todos/7");
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate with a state gives the state to the history entry", async () => {
  const { router, fake } = routerAt("/todos");
  await router.navigate(router.parse("/todos/7"), { state: { scroll: 320 } });
  expect(fake.state())
    .toEqual({ scroll: 320 });
});

test("a URL no route matches is rejected: it resolves false, and the URL does not change", async () => {
  const { router, fake } = routerAt("/todos");
  const elsewhere = UrlBuilder.for([{ path: "/nowhere" }] as const)
    .parse("/nowhere");
  const committed = await router.navigate(elsewhere, { state: { scroll: 1 } });
  expect(committed)
    .toBe(false);
  expect(router.url())
    .toBe("/todos");
  expect(fake.state())
    .toBeNull();
});

test("a navigation to a matched URL resolves true once it commits", async () => {
  const { router } = routerAt("/todos");
  expect(await router.navigate(router.parse("/todos/7")))
    .toBe(true);
});

test("a ** route catches the URLs no other route matches", async () => {
  const NotFound = class {};
  const tree: Route = {
    path: "",
    component: Root,
    children: [TODOS, { path: "**", component: NotFound }],
  };
  const { router, destroy } = routerOver(tree, "/todos");
  await router.navigate(router.parse("/nowhere"));
  expect(router.match()?.route.component)
    .toBe(NotFound);
  destroy();
});

test("activated starts with the root, then one entry per matched level", () => {
  const { router, destroy } = routerAt("/todos/7");
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
  const { router, destroy } = routerAt("/todos");
  const before = router.activated()[0];
  await router.navigate(router.parse("/todos/7"));
  expect(router.activated()[0])
    .toBe(before);
  destroy();
});

test("with no match, the activated routes are the root alone", () => {
  const { router, destroy } = routerAt("/nowhere");
  expect(router.activated())
    .toHaveLength(1);
  expect(router.activated()[0]?.route)
    .toBe(ROOT);
  destroy();
});

test("a level keeps its instance when only the query changes", async () => {
  const { router, destroy } = routerAt("/todos/7");
  const before = router.activated()[2];
  await router.navigate(router.parse("/todos/7?tab=done"));
  expect(router.activated()[2])
    .toBe(before);
  destroy();
});

test("a level is made again when its params change, and the levels above it stay", async () => {
  const { router, destroy } = routerAt("/todos/7");
  const root = router.activated()[0];
  const shell = router.activated()[1];
  const before = router.activated()[2];
  await router.navigate(router.parse("/todos/8"));
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
  const { router, destroy } = routerOver({ path: "", component: Root, children: [notFound] }, "/anything/a");
  const before = router.activated()[1];
  await router.navigate(router.parse("/anything/b"));
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
  const { router, destroy } = routerOver(ORG_ROOT, "/orgs/acme/teams/x");
  const before = router.activated()[4];
  await router.navigate(router.parse("/orgs/beta/teams/x"));
  expect(router.activated()[4])
    .not.toBe(before);
  expect(router.activated()[4]?.route)
    .toBe(TEAM);
  destroy();
});

test("the root has no parent, and each level's parent is the level above it", () => {
  const { router, destroy } = routerAt("/todos/7");
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
  const { router, destroy } = routerOver(ORG_ROOT, "/orgs/acme/teams/x");
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
  const { router, destroy } = routerAt("/todos/7");
  const shell = router.activated()[1];
  const leafBefore = router.activated()[2];
  await router.navigate(router.parse("/todos/7?tab=done"));
  expect(getOrThrow(router.activated()[2]!.parent, () => new Error("no parent")))
    .toBe(shell);
  await router.navigate(router.parse("/todos/8"));
  expect(getOrThrow(router.activated()[2]!.parent, () => new Error("no parent")))
    .toBe(shell);
  expect(router.activated()[2])
    .not.toBe(leafBefore);
  destroy();
});

test("parse throws a ParseError for a URL no route matches", () => {
  const { router } = routerAt("/todos");
  expect(() => router.parse("/nowhere"))
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

test("a guard that says no stops the navigation, and the URL does not change", async () => {
  const deny: Guard = () => false;
  const { router, destroy } = routerWithGuard([deny]);
  expect(await router.navigate(router.parse("/todos/7")))
    .toBe(false);
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a guard that redirects sends the navigation to its target instead", async () => {
  const toList: Guard = () => UrlBuilder.for(CHILDREN)
    .parse("/todos");
  const { router, destroy } = routerWithGuard([toList]);
  expect(await router.navigate(router.parse("/todos/7")))
    .toBe(true);
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a route that redirects to itself stops after the redirect cap, and nothing changes", async () => {
  const loop: Route = {
    path: "",
    component: Root,
    children: [{ path: "todos", component: TodoList, redirect: () => UrlBuilder.for(CHILDREN)
      .parse("/todos") }],
  };
  const { router, destroy } = routerOver(loop, "/");
  expect(MAX_REDIRECTS)
    .toBe(10);
  expect(await router.navigate(UrlBuilder.for([{ path: "todos" }] as const)
    .parse("/todos")))
    .toBe(false);
  expect(router.url())
    .toBe("/");
  destroy();
});

test("a navigation replaced by a newer one resolves false, and the newer one commits", async () => {
  let release: ((value: boolean) => void) | undefined;
  const slow: Guard = () => fromComputation<boolean, unknown>((ok) => {
    release = ok;
    return () => {};
  });
  const { router, destroy } = routerWithGuard([slow], "/todos");
  const first = router.navigate(router.parse("/todos/7"));
  const second = router.navigate(router.parse("/todos"));
  expect(await second)
    .toBe(true);
  release?.(true);
  expect(await first)
    .toBe(false);
  expect(router.url())
    .toBe("/todos");
  destroy();
});

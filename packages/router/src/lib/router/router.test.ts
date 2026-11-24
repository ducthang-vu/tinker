import { expect, test } from "vitest";
import { inject, Injector, type Maybe, provide, runInInjectionContext } from "@tinker/core";
import { ActivatedRoute } from "../state/activated-route.ts";
import { Location } from "../location/location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "../location/platform-location.ts";
import { Router } from "./router.ts";
import { ParseError, UrlBuilder } from "../destination/url-builder.ts";
import type { Guard } from "../pipeline/guard-step.ts";
import { MAX_REDIRECTS } from "../pipeline/match-step.ts";
import type { Route } from "./route.ts";
import { fromComputation, isNone, getOrThrow, type Task } from "@tinker/functional";

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
const CHILDREN: readonly Route[] = [
  { path: "/todos", component: TodoList },
  { path: "/todos/:id", component: TodoDetail },
];
const ROOT: Route = { path: "", component: Root, children: CHILDREN };

/** A router over `ROOT`, in the context of a fake platform that starts at `url`. */
function routerAt(url: string) {
  const fake = fakePlatform(url);
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(ROOT, inject(Location), inject(Injector)) }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  return { router, fake, destroy };
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

test("navigate changes the URL and the match", () => {
  const { router } = routerAt("/todos");
  router.navigate(router.parse("/todos/7"));
  expect(router.url())
    .toBe("/todos/7");
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate with a state gives the state to the history entry", () => {
  const { router, fake } = routerAt("/todos");
  router.navigate(router.parse("/todos/7"), { state: { scroll: 320 } });
  expect(fake.state())
    .toEqual({ scroll: 320 });
});

test("a URL no route matches is rejected: it resolves false, and the URL does not change", async () => {
  const { router, fake } = routerAt("/todos");
  const elsewhere = UrlBuilder.for([{ path: "/nowhere" }] as const).parse("/nowhere");
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

test("a ** route catches the URLs no other route matches", () => {
  const fake = fakePlatform("/todos");
  const NotFound = class {};
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router(
          { path: "", component: Root, children: [...CHILDREN, { path: "**", component: NotFound }] },
          inject(Location), inject(Injector),
        ),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  router.navigate(router.parse("/nowhere"));
  expect(router.match()?.route.component)
    .toBe(NotFound);
  destroy();
});

test("activated starts with the root, then one entry per matched level", () => {
  const { router, destroy } = routerAt("/todos/7");
  const [first, second] = router.activated();
  expect(first?.route)
    .toBe(ROOT);
  expect(second?.route)
    .toBe(CHILDREN[1]);
  expect(second?.params)
    .toEqual({ id: "7" });
  expect(second?.segments)
    .toEqual(["todos", "7"]);
  expect(router.activated())
    .toHaveLength(2);
  destroy();
});

test("the root activated route is the same instance across navigations", () => {
  const { router, destroy } = routerAt("/todos");
  const before = router.activated()[0];
  router.navigate(router.parse("/todos/7"));
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

test("a level keeps its instance when only the query changes", () => {
  const { router, destroy } = routerAt("/todos/7");
  const before = router.activated()[1];
  router.navigate(router.parse("/todos/7?tab=done"));
  expect(router.activated()[1])
    .toBe(before);
  destroy();
});

test("a level is made again when its params change, and the root stays", () => {
  const { router, destroy } = routerAt("/todos/7");
  const root = router.activated()[0];
  const before = router.activated()[1];
  router.navigate(router.parse("/todos/8"));
  expect(router.activated()[1])
    .not.toBe(before);
  expect(router.activated()[0])
    .toBe(root);
  destroy();
});

test("a ** level is made again when its segments change", () => {
  const notFound = { path: "**", component: class {} };
  const fake = fakePlatform("/anything/a");
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: [notFound] }, inject(Location), inject(Injector)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const before = router.activated()[1];
  router.navigate(router.parse("/anything/b"));
  expect(router.activated()[1])
    .not.toBe(before);
  destroy();
});

test("a level under a changed parent is made again, though its own params are the same", () => {
  const team = { path: "teams/:team", component: class {} };
  const org = { path: "/orgs/:org", component: class {}, children: [team] };
  const fake = fakePlatform("/orgs/acme/teams/x");
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location), inject(Injector)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const before = router.activated()[2];
  router.navigate(router.parse("/orgs/beta/teams/x"));
  expect(router.activated()[2])
    .not.toBe(before);
  expect(router.activated()[2]?.route)
    .toBe(team);
  destroy();
});

test("the root has no parent, and each level's parent is the level above it", () => {
  const { router, destroy } = routerAt("/todos/7");
  const [root, leaf] = router.activated() as [ActivatedRoute, ActivatedRoute];
  expect(isNone(root.parent))
    .toBe(true);
  expect(getOrThrow(leaf.parent, () => new Error("no parent")))
    .toBe(root);
  destroy();
});

test("a deeper level's parent chain reaches the root", () => {
  const team = { path: "teams/:team", component: class {} };
  const org = { path: "/orgs/:org", component: class {}, children: [team] };
  const fake = fakePlatform("/orgs/acme/teams/x");
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location), inject(Injector)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const [root, orgLevel, teamLevel] = router.activated();
  expect(getOrThrow(teamLevel!.parent, () => new Error("no parent")))
    .toBe(orgLevel);
  expect(getOrThrow(orgLevel!.parent, () => new Error("no parent")))
    .toBe(root);
  destroy();
});

test("a kept level keeps its parent, and a made level gets the kept one as its parent", () => {
  const { router, destroy } = routerAt("/todos/7");
  const [root, leafBefore] = router.activated();
  router.navigate(router.parse("/todos/7?tab=done"));
  expect(getOrThrow(router.activated()[1]!.parent, () => new Error("no parent")))
    .toBe(root);
  router.navigate(router.parse("/todos/8"));
  expect(getOrThrow(router.activated()[1]!.parent, () => new Error("no parent")))
    .toBe(root);
  expect(router.activated()[1])
    .not.toBe(leafBefore);
  destroy();
});





test("parse throws a ParseError for a URL no route matches", () => {
  const { router } = routerAt("/todos");
  expect(() => router.parse("/nowhere"))
    .toThrow(ParseError);
});

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
  const toList: Guard = (request) => request.chain.length > 0
    ? UrlBuilder.for(CHILDREN).parse("/todos")
    : true;
  const { router, destroy } = routerWithGuard([toList]);
  expect(await router.navigate(router.parse("/todos/7")))
    .toBe(true);
  expect(router.url())
    .toBe("/todos");
  destroy();
});

test("a route that redirects to itself stops after the redirect cap, and nothing changes", async () => {
  const loop = [
    { path: "/todos", component: TodoList, redirect: () => UrlBuilder.for(CHILDREN).parse("/todos") },
  ] as const;
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fakePlatform("/").platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: loop }, inject(Location), inject(Injector)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  expect(MAX_REDIRECTS)
    .toBe(10);
  expect(await router.navigate(UrlBuilder.for(loop).parse("/todos")))
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
  }) as Task<boolean, unknown>;
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

/** A router over CHILDREN whose `/todos/:id` route runs `guards`. */
function routerWithGuard(guards: readonly Guard[], url = "/todos") {
  const fake = fakePlatform(url);
  const guarded = CHILDREN.map((route) => route.path === "/todos/:id" ? { ...route, canActivate: guards } : route);
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: guarded }, inject(Location), inject(Injector)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  return { router, destroy };
}

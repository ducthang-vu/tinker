import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { Location } from "./location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "./platform-location.ts";
import { NoRouteError, Router } from "./router.ts";
import type { Route } from "./route.ts";

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
      provide(Router, { useFactory: () => new Router(ROOT, inject(Location)) }),
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
  router.navigate("/todos/7");
  expect(router.url())
    .toBe("/todos/7");
  expect(router.match()?.params)
    .toEqual({ id: "7" });
});

test("navigate with a state gives the state to the history entry", () => {
  const { router, fake } = routerAt("/todos");
  router.navigate("/todos/7", { state: { scroll: 320 } });
  expect(fake.state())
    .toEqual({ scroll: 320 });
});

test("a URL no route matches is rejected, and the URL does not change", () => {
  const { router, fake } = routerAt("/todos");
  const result = router.navigate("/nowhere", { state: { scroll: 1 } });
  result.match({
    left: (failure) => {
      expect(failure)
        .toBeInstanceOf(NoRouteError);
      expect(failure.message)
        .toBe("Cannot match any route: /nowhere");
    },
    right: () => {
      throw new Error("expected a rejection");
    },
  });
  expect(router.url())
    .toBe("/todos");
  expect(fake.state())
    .toBeNull();
});

test("a navigation to a matched URL succeeds", () => {
  const { router } = routerAt("/todos");
  const result = router.navigate("/todos/7");
  expect(result.match({ left: () => false, right: () => true }))
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
          inject(Location),
        ),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  router.navigate("/nowhere");
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
  router.navigate("/todos/7");
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
  router.navigate("/todos/7?tab=done");
  expect(router.activated()[1])
    .toBe(before);
  destroy();
});

test("a level is made again when its params change, and the root stays", () => {
  const { router, destroy } = routerAt("/todos/7");
  const root = router.activated()[0];
  const before = router.activated()[1];
  router.navigate("/todos/8");
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
        useFactory: () => new Router({ path: "", component: Root, children: [notFound] }, inject(Location)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const before = router.activated()[1];
  router.navigate("/anything/b");
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
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const before = router.activated()[2];
  router.navigate("/orgs/beta/teams/x");
  expect(router.activated()[2])
    .not.toBe(before);
  expect(router.activated()[2]?.route)
    .toBe(team);
  destroy();
});

test("the root has no parent, and each level's parent is the level above it", () => {
  const { router, destroy } = routerAt("/todos/7");
  const [root, leaf] = router.activated();
  expect(root?.parent.isNone())
    .toBe(true);
  expect(leaf?.parent.getOrThrow(() => new Error("no parent")))
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
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const [root, orgLevel, teamLevel] = router.activated();
  expect(teamLevel?.parent.getOrThrow(() => new Error("no parent")))
    .toBe(orgLevel);
  expect(orgLevel?.parent.getOrThrow(() => new Error("no parent")))
    .toBe(root);
  destroy();
});

test("a kept level keeps its parent, and a made level gets the kept one as its parent", () => {
  const { router, destroy } = routerAt("/todos/7");
  const [root, leafBefore] = router.activated();
  router.navigate("/todos/7?tab=done");
  expect(router.activated()[1]?.parent.getOrThrow(() => new Error("no parent")))
    .toBe(root);
  router.navigate("/todos/8");
  expect(router.activated()[1]?.parent.getOrThrow(() => new Error("no parent")))
    .toBe(root);
  expect(router.activated()[1])
    .not.toBe(leafBefore);
  destroy();
});

test("a relative URL is resolved against the path of relativeTo", () => {
  const team = { path: "teams/:team", component: class {} };
  const org = { path: "/orgs/:org", component: class {}, children: [team] };
  const fake = fakePlatform("/orgs/acme/teams/x");
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const [, orgLevel, teamLevel] = router.activated();
  router.navigate("teams/z", { relativeTo: orgLevel });
  expect(router.url())
    .toBe("/orgs/acme/teams/z");
  router.navigate("../y", { relativeTo: teamLevel });
  expect(router.url())
    .toBe("/orgs/acme/teams/y");
  destroy();
});

test("a relative URL that matches no route is rejected with its resolved URL", () => {
  const { router, destroy } = routerAt("/todos/7");
  const result = router.navigate("../..", { relativeTo: router.activated()[1] });
  result.match({
    left: (failure) => {
      expect(failure.url)
        .toBe("/");
    },
    right: () => {
      throw new Error("expected a rejection");
    },
  });
  expect(router.url())
    .toBe("/todos/7");
  destroy();
});

test("navigate takes the segments of a URL as an array", () => {
  const { router, destroy } = routerAt("/todos");
  router.navigate(["todos", "7"]);
  expect(router.url())
    .toBe("/todos/7");
  router.navigate(["todos", "8?tab=done"]);
  expect(router.url())
    .toBe("/todos/8?tab=done");
  destroy();
});

test("an array of segments is resolved against relativeTo, with '..'", () => {
  const team = { path: "teams/:team", component: class {} };
  const org = { path: "/orgs/:org", component: class {}, children: [team] };
  const fake = fakePlatform("/orgs/acme/teams/x");
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, {
        useFactory: () => new Router({ path: "", component: Root, children: [org] }, inject(Location)),
      }),
    ],
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const [, orgLevel, teamLevel] = router.activated();
  router.navigate(["teams", "z"], { relativeTo: orgLevel });
  expect(router.url())
    .toBe("/orgs/acme/teams/z");
  router.navigate(["..", "y"], { relativeTo: teamLevel });
  expect(router.url())
    .toBe("/orgs/acme/teams/y");
  destroy();
});

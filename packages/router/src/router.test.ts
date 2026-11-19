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
  router.navigate("/todos/7", { scroll: 320 });
  expect(fake.state())
    .toEqual({ scroll: 320 });
});

test("a URL no route matches is rejected, and the URL does not change", () => {
  const { router, fake } = routerAt("/todos");
  const result = router.navigate("/nowhere", { scroll: 1 });
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

import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { Location } from "./location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "./platform-location.ts";
import { Router } from "./router.ts";
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

class TodoList {}
class TodoDetail {}
const ROUTES: readonly Route[] = [
  { path: "/todos", component: TodoList },
  { path: "/todos/:id", component: TodoDetail },
];

/** A router over `ROUTES`, in the context of a fake platform that starts at `url`. */
function routerAt(url: string) {
  const fake = fakePlatform(url);
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: fake.platform }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(ROUTES, inject(Location)) }),
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

test("a URL no route matches has no match, but the URL still changes", () => {
  const { router } = routerAt("/todos");
  router.navigate("/nowhere");
  expect(router.url())
    .toBe("/nowhere");
  expect(router.match())
    .toBeUndefined();
});

import { nested } from "../destination/test-builder.ts";
import { expect, test } from "vitest";
import { inject, Injector, runInInjectionContext } from "@tinker/core";
import { NextRouteWithComponent } from "../state/next-route-with-component.ts";
import { AppPathBuilder } from "../destination/app-path-builder.ts";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";
import { getOrThrow } from "@tinker/functional";

class TodoList {}
const ROUTES: Route[] = [{ path: "/todos", component: TodoList }];

test("provideRouter gives a router over the browser's address bar", () => {
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROUTES) });
  const router = runInInjectionContext(injector, () => inject(Router));
  const urls = runInInjectionContext(injector, () => inject(AppPathBuilder));
  router.navigate(urls.parse("/todos?tab=open")
    .build());
  expect(router.url())
    .toBe("/todos?tab=open");
  expect(window.location.pathname)
    .toBe("/todos");
  expect(router.match()?.route.component)
    .toBe(TodoList);
  destroy();
  window.history.replaceState(null, "", "/");
});

test("NextRouteWithComponent is the first shown route after the root, as a signal", () => {
  window.history.replaceState(null, "", "/todos");
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROUTES) });
  const child = runInInjectionContext(injector, () => inject(NextRouteWithComponent));
  expect(getOrThrow(child(), () => new Error("no child")).route.component)
    .toBe(TodoList);
  destroy();
  window.history.replaceState(null, "", "/");
});

test("a route with no component is allowed, at the top or below another route", () => {
  expect(() => provideRouter([{ path: "/todos", component: class {} }]))
    .not.toThrow();
  expect(() => provideRouter([nested({ path: "/a", component: TodoList }, [{ path: "b", component: class {} }])]))
    .not.toThrow();
});

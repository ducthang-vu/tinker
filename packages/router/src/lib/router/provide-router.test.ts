import { expect, test } from "vitest";
import { inject, Injector, runInInjectionContext } from "@tinker/core";
import { ChildActivatedRoute } from "../state/child-activated-route.ts";
import { UrlBuilder } from "../destination/url-builder.ts";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";
import { getOrThrow } from "@tinker/functional";

class TodoList {}
const ROUTES: Route[] = [{ path: "/todos", component: TodoList }];

test("provideRouter gives a router over the browser's address bar", () => {
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROUTES) });
  const router = runInInjectionContext(injector, () => inject(Router));
  const urls = runInInjectionContext(injector, () => inject(UrlBuilder));
  router.navigate(urls.parse("/todos?tab=open"));
  expect(router.url())
    .toBe("/todos?tab=open");
  expect(window.location.pathname)
    .toBe("/todos");
  expect(router.match()?.route.component)
    .toBe(TodoList);
  destroy();
  window.history.replaceState(null, "", "/");
});

test("ChildActivatedRoute is the activated route after the root, as a signal", () => {
  window.history.replaceState(null, "", "/todos");
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROUTES) });
  const child = runInInjectionContext(injector, () => inject(ChildActivatedRoute));
  expect(getOrThrow(child(), () => new Error("no child")).route.component)
    .toBe(TodoList);
  destroy();
  window.history.replaceState(null, "", "/");
});

test("every route shows a component, the top-level ones too", () => {
  expect(() => provideRouter([{ path: "/todos", component: TodoList }]))
    .not.toThrow();
  expect(() => provideRouter([{ path: "/todos" }]))
    .toThrow("The route \"/todos\" needs a component");
  expect(() => provideRouter([{ path: "/a", component: TodoList, children: [{ path: "b" }] }]))
    .toThrow("The route \"b\" needs a component");
});

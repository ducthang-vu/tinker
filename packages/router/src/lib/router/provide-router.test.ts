import { expect, test } from "vitest";
import { inject, Injector, runInInjectionContext } from "@tinker/core";
import { ChildActivatedRoute } from "../state/child-activated-route.ts";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";
import { getOrThrow } from "@tinker/functional";

class TodoList {}
class Root {}
const ROOT: Route = { path: "", component: Root, children: [{ path: "/todos", component: TodoList }] };

test("provideRouter gives a router over the browser's address bar", () => {
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROOT) });
  const router = runInInjectionContext(injector, () => inject(Router));
  router.navigate("/todos?tab=open");
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
  const { injector, destroy } = Injector.create({ providers: provideRouter(ROOT) });
  const child = runInInjectionContext(injector, () => inject(ChildActivatedRoute));
  expect(getOrThrow(child(), () => new Error("no child")).route.component)
    .toBe(TodoList);
  destroy();
  window.history.replaceState(null, "", "/");
});

test("the root route may have no component, but every other route needs one", () => {
  expect(() => provideRouter({ path: "", children: [{ path: "/todos", component: TodoList }] }))
    .not.toThrow();
  expect(() => provideRouter({ path: "", children: [{ path: "/todos" }] }))
    .toThrow("The route \"/todos\" needs a component: only the root route may have none");
  expect(() => provideRouter({ path: "", children: [{ path: "/a", children: [{ path: "b" }] }] }))
    .toThrow("The route \"/a\" needs a component");
});

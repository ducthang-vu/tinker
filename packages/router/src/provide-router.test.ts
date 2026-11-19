import { expect, test } from "vitest";
import { inject, Injector, runInInjectionContext } from "@tinker/core";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

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

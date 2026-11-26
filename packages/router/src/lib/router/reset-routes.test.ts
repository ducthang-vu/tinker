import { expect, test } from "vitest";
import { Injector, inject, runInInjectionContext } from "@tinker/core";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

class Page {}

test("resetRoutes matches the current URL against the new routes", () => {
  window.history.replaceState(null, "", "/home");
  const { injector, destroy } = Injector.create({
    providers: provideRouter([{ path: "home", component: Page }]),
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  expect(router.match()?.route.path)
    .toBe("home");
  const about: Route = { path: "home", component: class {} };
  router.resetRoutes([about]);
  expect(router.match()?.route)
    .toBe(about);
  destroy();
});

test("resetRoutes shows nothing when no new route takes the current URL, and the URL is kept", () => {
  window.history.replaceState(null, "", "/home");
  const { injector, destroy } = Injector.create({
    providers: provideRouter([{ path: "home", component: Page }]),
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  router.resetRoutes([{ path: "about", component: Page }]);
  expect(router.match())
    .toBeUndefined();
  expect(window.location.pathname)
    .toBe("/home");
  destroy();
});

test("resetRoutes replaces the history entry by default, and adds one with history push", () => {
  window.history.replaceState(null, "", "/home");
  const { injector, destroy } = Injector.create({
    providers: provideRouter([{ path: "home", component: Page }]),
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  const before = window.history.length;
  router.resetRoutes([{ path: "home", component: Page }]);
  expect(window.history.length)
    .toBe(before);
  router.resetRoutes([{ path: "home", component: Page }], { history: "push" });
  expect(window.history.length)
    .toBe(before + 1);
  destroy();
});

test("resetRoutes with history push, at a URL no new route takes, shows nothing", () => {
  window.history.replaceState(null, "", "/nowhere");
  const { injector, destroy } = Injector.create({
    providers: provideRouter([{ path: "home", component: Page }]),
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  router.resetRoutes([{ path: "home", component: Page }], { history: "push" });
  expect(router.match())
    .toBeUndefined();
  destroy();
});

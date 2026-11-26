import { expect, test } from "vitest";
import { Injector, inject, runInInjectionContext } from "@tinker/core";
import { makeAppPath } from "../destination/app-path.ts";
import type { Route } from "./route.ts";
import { provideRouter } from "./provide-router.ts";
import { Router } from "./router.ts";

class Page {}

test("a navigation superseded while its lazy children load aborts that load", () => {
  window.history.replaceState(null, "", "/");
  const signals: AbortSignal[] = [];
  const routes: Route[] = [
    {
      path: "lazy",
      loadChildren: (signal) => {
        signals.push(signal);
        return new Promise(() => undefined);
      },
    },
    { path: "home", component: Page },
  ];
  const { injector, destroy } = Injector.create({ providers: provideRouter(routes) });
  const router = runInInjectionContext(injector, () => inject(Router));
  void router.navigate(makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined));
  expect(signals[0]?.aborted)
    .toBe(false);
  void router.navigate(makeAppPath([{ kind: "segment", value: "home" }], {}, undefined));
  expect(signals[0]?.aborted)
    .toBe(true);
  destroy();
});

test("at a URL no route takes, the router's match is undefined", () => {
  window.history.replaceState(null, "", "/nowhere");
  const { injector, destroy } = Injector.create({
    providers: provideRouter([{ path: "home", component: Page }]),
  });
  const router = runInInjectionContext(injector, () => inject(Router));
  expect(router.match())
    .toBeUndefined();
  destroy();
});

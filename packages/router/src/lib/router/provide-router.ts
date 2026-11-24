// The providers of the router: the browser's location, the Location that reads it, and the
// Router over the route tree. An app calls provideRouter once, when it bootstraps.

import { computed, inject, Injector, type Maybe, provide, type Provider } from "@tinker/core";
import { Location } from "../location/location.ts";
import { isEqual } from "@tinker/functional";
import { ActivatedRoute } from "../state/activated-route.ts";
import { ChildActivatedRoute, nextAfter } from "../state/child-activated-route.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "../location/platform-location.ts";
import { Router } from "./router.ts";
import { UrlBuilder } from "../destination/url-builder.ts";
import { type Route, componentOf } from "./route.ts";

/**
 * The providers for a router over `routes`, the top-level routes of the app, using the browser's
 * location. Every route shows a component, and the top-level ones are checked too.
 * @param routes
 * @param routes The top-level routes of the app.
 * @returns The providers of the router.
 */
export function provideRouter(routes: readonly Route[]): readonly Provider[] {
  checkComponents(routes);
  // The router matches over one tree: the routes are the children of a root that is never shown.
  const root: Route = { path: "", children: routes };
  return [
    provide(PLATFORM_LOCATION, { useValue: browserPlatformLocation }),
    provide(Location, { useClass: Location }),
    provide(UrlBuilder, { useClass: UrlBuilder }),
    provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
    provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
    provide(ChildActivatedRoute, {
      useFactory: () => {
        const router = inject(Router);
        // Readers run only when the shown route changes, by the content of the Maybe.
        return computed(
          () => nextAfter(router.activated(), router.rootRoute),
          (a, b) => isEqual(a, b),
        );
      },
    }),
  ];
}

/**
 * Every route must name the component it shows, the top-level ones and their children alike.
 * @param routes
 * @param routes The routes to check.
 */
function checkComponents(routes: readonly Route[]): void {
  for (const route of routes) {
    componentOf(route);
    checkComponents(route.children ?? []);
  }
}

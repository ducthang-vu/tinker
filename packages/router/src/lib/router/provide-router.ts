// The providers of the router: the browser's location, the Location that reads it, and the
// Router over the route tree. An app calls provideRouter once, when it bootstraps.

import { computed, inject, Injector, type Maybe, provide, type Provider } from "@tinker/core";
import { Location } from "../location/location.ts";
import { isEqual } from "@tinker/functional";
import { ActivatedRoute } from "../state/activated-route.ts";
import { NextRouteWithComponent, shownAfter } from "../state/next-route-with-component.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "../location/platform-location.ts";
import { Router } from "./router.ts";
import { AppPathBuilder } from "../destination/app-path-builder.ts";
import type { Route } from "./route.ts";
import { seedChildren } from "./lazy-children.ts";

/**
 * The providers for a router over `routes`, the top-level routes of the app, using the browser's
 * location. Every route shows a component, and the top-level ones are checked too.
 * @param routes
 * @param routes The top-level routes of the app.
 * @returns The providers of the router.
 */
export function provideRouter(routes: readonly Route[]): readonly Provider[] {
  // The router matches over one tree: the routes are the children of a root that is never shown.
  const root: Route = { path: "", loadChildren: () => Promise.resolve(routes) };
  seedChildren(root, routes);
  return [
    provide(PLATFORM_LOCATION, { useValue: browserPlatformLocation }),
    provide(Location, { useClass: Location }),
    provide(AppPathBuilder, { useClass: AppPathBuilder }),
    provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
    provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
    provide(NextRouteWithComponent, {
      useFactory: () => {
        const router = inject(Router);
        // Readers run only when the shown route changes, by the content of the Maybe.
        return computed(
          () => shownAfter(router.activated(), router.rootRoute),
          (a, b) => isEqual(a, b),
        );
      },
    }),
  ];
}

// The providers of the router: the browser's location, the Location that reads it, and the
// Router over the route tree. An app calls provideRouter once, when it bootstraps.

import { computed, inject, Maybe, provide, type Provider } from "@tinker/core";
import { Location } from "./location.ts";
import { ChildActivatedRoute } from "./child-activated-route.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "./platform-location.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

/** The providers for a router over the tree under `root`, using the browser's location. */
export function provideRouter(root: Route): readonly Provider[] {
  return [
    provide(PLATFORM_LOCATION, { useValue: browserPlatformLocation }),
    provide(Location, { useClass: Location }),
    provide(Router, { useFactory: () => new Router(root, inject(Location)) }),
    provide(ChildActivatedRoute, {
      useFactory: () => {
        const router = inject(Router);
        return computed(() => Maybe.from(router.activated()[1]));
      },
    }),
  ];
}

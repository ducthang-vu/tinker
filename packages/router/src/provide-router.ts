// The providers of the router: the browser's location, the Location that reads it, and the
// Router for the given route table. An app calls provideRouter once, when it bootstraps.

import { inject, provide, type Provider } from "@tinker/core";
import { Location } from "./location.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "./platform-location.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

/** The providers for a router over `routes`, using the browser's location. */
export function provideRouter(routes: readonly Route[]): readonly Provider[] {
  return [
    provide(PLATFORM_LOCATION, { useValue: browserPlatformLocation }),
    provide(Location, { useClass: Location }),
    provide(Router, { useFactory: () => new Router(routes, inject(Location)) }),
  ];
}

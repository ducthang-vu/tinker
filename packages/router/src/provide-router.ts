// The providers of the router: the browser's location, the Location that reads it, and the
// Router over the route tree. An app calls provideRouter once, when it bootstraps.

import { computed, inject, provide, type Provider } from "@tinker/core";
import { Location } from "./location.ts";
import { ActivatedRoute } from "./activated-route.ts";
import { ChildActivatedRoute, nextAfter } from "./child-activated-route.ts";
import { browserPlatformLocation, PLATFORM_LOCATION } from "./platform-location.ts";
import { Router } from "./router.ts";
import type { Route } from "./route.ts";

/** The providers for a router over the tree under `root`, using the browser's location. */
export function provideRouter(root: Route): readonly Provider[] {
  return [
    provide(PLATFORM_LOCATION, { useValue: browserPlatformLocation }),
    provide(Location, { useClass: Location }),
    provide(Router, { useFactory: () => new Router(root, inject(Location)) }),
    provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
  ];
}

/**
 * The provider a root component needs for its outlet: the route after the root, the top level. It
 * goes in the root component's `providers`, so an outlet elsewhere that provides nothing fails.
 */
export function provideRootOutlet(): Provider {
  return provide(ChildActivatedRoute, {
    useFactory: () => {
      const router = inject(Router);
      // Readers run only when the shown route changes, by the content of the Maybe.
      return computed(
        () => nextAfter(router.activated(), router.rootRoute),
        (a, b) => a.isEqual(b),
      );
    },
  });
}

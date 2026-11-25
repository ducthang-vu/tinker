// A builder over a route tree, for tests: an injector with a router over `routes`, and the builder
// injected from it, as an app's root would have it.

import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { Location } from "../location/location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "../location/platform-location.ts";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { ActivatedRoute } from "../state/activated-route.ts";
import { AppPathBuilder } from "./app-path-builder.ts";

/** A browser that stays where it is: a test moves the builder, not the page. */
const still: PlatformLocation = {
  url: () => "/",
  state: () => null,
  push: () => {},
  replace: () => {},
  onPop: () => () => {},
};

/**
 * The builder of a route tree, injected from a router over it.
 *
 * @param routes The top-level routes of the tree.
 * @returns The builder at the root of the tree.
 */
export function builderOver(routes: readonly Route[]): AppPathBuilder {
  const root: Route = { path: "", children: routes };
  const { injector } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: still }),
      provide(Location, { useClass: Location }),
      provide(Router, { useFactory: () => new Router(root, inject(Location), inject(Injector)) }),
      provide(ActivatedRoute, { useFactory: () => inject(Router).rootRoute }),
      provide(AppPathBuilder, { useClass: AppPathBuilder }),
    ],
  });
  return runInInjectionContext(injector, () => inject(AppPathBuilder));
}

// A builder over a route tree, for tests: an injector with a router over `routes`, and the builder
// injected from it, as an app's root would have it.

import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { Location } from "../location/location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "../location/platform-location.ts";
import { Router } from "../router/router.ts";
import type { Route } from "../router/route.ts";
import { seedChildren } from "../router/lazy-children.ts";
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
  const root: Route = { path: "", loadChildren: () => Promise.resolve(routes) };
  seedChildren(root, routes);
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

/**
 * A route whose children are already loaded: a test's nested tree, which the synchronous builder
 * and matcher see at once.
 *
 * @param route The route, without its children.
 * @param children The routes under it.
 * @returns The route, with a loader for the children that is already loaded.
 */
export function nested<R extends { readonly path: string }>(
  route: R,
  children: readonly Route[],
): R & { readonly loadChildren: (signal: AbortSignal) => Promise<readonly Route[]> } {
  const loadChildren = (): Promise<readonly Route[]> => Promise.resolve(children);
  const made = { ...route, loadChildren };
  seedChildren(made, children);
  return made;
}
